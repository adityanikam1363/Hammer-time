import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import {
  computeFrame,
  detectViolations,
  turnForTimestamp,
  violationId,
  type ComputedFrame,
  type PixelPoint,
  type RawFrame,
} from "./geometry";

export interface IngestFrameInput {
  frameIndex: number;
  timestampSec: number;
  leftBoundaryPx: PixelPoint[];
  rightBoundaryPx: PixelPoint[];
  tireLeftPx: PixelPoint;
  tireRightPx: PixelPoint;
  segConfidence: number;
  frameWidth: number;
  frameHeight: number;
}

interface RawFrameRow {
  frame_index: number;
  timestamp_sec: number | string;
  left_boundary_px: unknown;
  right_boundary_px: unknown;
  tire_left_px: unknown;
  tire_right_px: unknown;
  seg_confidence: number | string;
  frame_width: number;
  frame_height: number;
}

const num = (v: number | string) => (typeof v === "number" ? v : Number.parseFloat(v));
const asPoints = (v: unknown): PixelPoint[] =>
  Array.isArray(v) ? v.map((p) => ({ x: Number((p as PixelPoint).x), y: Number((p as PixelPoint).y) })) : [];
const asJson = (v: unknown) => v as unknown as Json;
const asPoint = (v: unknown): PixelPoint => ({
  x: Number((v as PixelPoint | null)?.x ?? 0),
  y: Number((v as PixelPoint | null)?.y ?? 0),
});

function rowToRawFrame(row: RawFrameRow): RawFrame {
  return {
    frameIndex: row.frame_index,
    timestampSec: num(row.timestamp_sec),
    leftBoundaryPx: asPoints(row.left_boundary_px),
    rightBoundaryPx: asPoints(row.right_boundary_px),
    tireLeftPx: asPoint(row.tire_left_px),
    tireRightPx: asPoint(row.tire_right_px),
    segConfidence: num(row.seg_confidence),
    frameWidth: row.frame_width,
    frameHeight: row.frame_height,
  };
}

const boundaryRow = (sessionId: string, f: ComputedFrame) => ({
  session_id: sessionId,
  frame_index: f.frameIndex,
  timestamp_sec: f.timestampSec,
  left_boundary: asJson(f.leftBoundary),
  right_boundary: asJson(f.rightBoundary),
  tire_left: asJson(f.tireLeft),
  tire_right: asJson(f.tireRight),
  offset_left_px: f.offsetLeftPx,
  offset_right_px: f.offsetRightPx,
  breached: f.breached,
});

/**
 * Full ingestion pipeline for one batch of CV detections:
 * store raw -> fit + offset -> normalise -> debounce -> confidence -> turn -> persist.
 * Violations are recomputed for the whole session so an excursion that straddles
 * two batches still produces exactly one row; steward decisions are preserved.
 */
export async function ingestFrames(sessionId: string, frames: IngestFrameInput[]) {
  const db = supabaseAdmin;

  const { error: rawError } = await db.from("raw_frames").upsert(
    frames.map((f) => ({
      session_id: sessionId,
      frame_index: f.frameIndex,
      timestamp_sec: f.timestampSec,
      left_boundary_px: asJson(f.leftBoundaryPx),
      right_boundary_px: asJson(f.rightBoundaryPx),
      tire_left_px: asJson(f.tireLeftPx),
      tire_right_px: asJson(f.tireRightPx),
      seg_confidence: f.segConfidence,
      frame_width: f.frameWidth,
      frame_height: f.frameHeight,
    })),
    { onConflict: "session_id,frame_index" },
  );
  if (rawError) throw new Error(`raw_frames insert failed: ${rawError.message}`);

  // Per-frame geometry for this batch.
  const batchComputed = frames.map((f) => computeFrame(f as RawFrame));
  const { error: boundaryError } = await db
    .from("boundary_frames")
    .upsert(batchComputed.map((f) => boundaryRow(sessionId, f)), { onConflict: "session_id,frame_index" });
  if (boundaryError) throw new Error(`boundary_frames upsert failed: ${boundaryError.message}`);

  // Session-wide recompute of violations.
  const { data: allRaw, error: readError } = await db
    .from("raw_frames")
    .select(
      "frame_index,timestamp_sec,left_boundary_px,right_boundary_px,tire_left_px,tire_right_px,seg_confidence,frame_width,frame_height",
    )
    .eq("session_id", sessionId)
    .order("frame_index", { ascending: true });
  if (readError) throw new Error(`raw_frames read failed: ${readError.message}`);

  const computed = (allRaw ?? []).map((row) => computeFrame(rowToRawFrame(row as RawFrameRow)));
  const detected = detectViolations(computed);

  const { data: session } = await db
    .from("sessions")
    .select("duration_sec")
    .eq("id", sessionId)
    .maybeSingle();
  const durationSec = session ? num(session.duration_sec as number | string) : 0;

  let { data: calibration } = await db
    .from("calibration_points")
    .select("turn_number,timestamp_sec")
    .eq("session_id", sessionId);

  // Never assign turn 0 to everything because calibration was missing.
  if (!calibration?.length && durationSec > 0) {
    const { buildCalibration } = await import("./calibration");
    const generated = buildCalibration(durationSec);
    await db.from("calibration_points").upsert(
      generated.map((c) => ({
        session_id: sessionId,
        turn_number: c.turnNumber,
        timestamp_sec: c.timestampSec,
        x_pct: c.xPct,
        y_pct: c.yPct,
      })),
      { onConflict: "session_id,turn_number" },
    );
    calibration = generated.map((c) => ({ turn_number: c.turnNumber, timestamp_sec: c.timestampSec }));
  }

  const calibrationPoints = (calibration ?? []).map((c) => ({
    turnNumber: c.turn_number,
    timestampSec: num(c.timestamp_sec as number | string),
  }));


  const { data: existing } = await db
    .from("violations")
    .select("id,timestamp_sec,status")
    .eq("session_id", sessionId);
  const previous = (existing ?? []).map((v) => ({
    id: v.id,
    timestampSec: num(v.timestamp_sec as number | string),
    status: v.status,
  }));

  const shortId = sessionId.slice(0, 4);
  const rows = detected.map((v, index) => {
    // Carry a steward's decision across recomputes when the incident is the same moment.
    const match = previous.find((p) => Math.abs(p.timestampSec - v.timestampSec) < 0.3);
    return {
      id: `${violationId(index + 1)}-${shortId}`,
      session_id: sessionId,
      timestamp_sec: v.timestampSec,
      turn_number: turnForTimestamp(v.timestampSec, calibrationPoints),
      side: v.side,
      offset_px: v.offsetPx,
      confidence: v.confidence,
      status: match?.status ?? "pending",
    };
  });

  const keepIds = rows.map((r) => r.id);
  if (rows.length > 0) {
    const { error: upsertError } = await db.from("violations").upsert(rows, { onConflict: "id" });
    if (upsertError) throw new Error(`violations upsert failed: ${upsertError.message}`);
  }

  let stale = db.from("violations").delete().eq("session_id", sessionId);
  if (keepIds.length > 0) stale = stale.not("id", "in", `(${keepIds.map((id) => `"${id}"`).join(",")})`);
  await stale;

  // Sessions leave "processing" once the analysed frames cover the clip.
  const coveredSec = computed.reduce((max, f) => Math.max(max, f.timestampSec), 0);
  const status = durationSec > 0 && coveredSec >= durationSec - 1.5 ? "ready" : "processing";
  await db.from("sessions").update({ status }).eq("id", sessionId);

  return { framesIngested: frames.length, violations: rows.length, status, coveredSec };

}
