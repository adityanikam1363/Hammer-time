import { supabase } from "@/integrations/supabase/client";
import type { BoundaryFrame } from "@/data/boundary";
import type { CalibrationPoint } from "@/data/calibration";
import { buildCalibration } from "@/lib/trackshift/calibration";
import type { Violation } from "@/data/violations";

import {
  toBoundaryFrame,
  toCalibrationPoint,
  toViolation,
  type BoundaryFrameRow,
  type CalibrationRow,
  type ViolationRow,
} from "@/lib/trackshift/mappers";

export interface SessionSummary {
  id: string;
  trackSlug: string;
  videoUrl: string | null;
  durationSec: number;
  status: "processing" | "ready" | "failed";
}

const VIDEO_BUCKET = "session-videos";

/** Most recent session, or null while the backend has no data yet. */
export async function fetchLatestSession(): Promise<SessionSummary | null> {
  const { data, error } = await supabase
    .from("sessions")
    .select("id,track_slug,video_url,duration_sec,status")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    trackSlug: data.track_slug,
    videoUrl: data.video_url,
    durationSec: Number(data.duration_sec),
    status: data.status as SessionSummary["status"],
  };
}

export async function fetchViolations(sessionId: string): Promise<Violation[]> {
  const { data, error } = await supabase
    .from("violations")
    .select("id,timestamp_sec,turn_number,side,offset_px,confidence,clip_url,status")
    .eq("session_id", sessionId)
    .order("timestamp_sec", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toViolation(row as ViolationRow));
}

export async function fetchCalibration(sessionId: string): Promise<CalibrationPoint[]> {
  const { data, error } = await supabase
    .from("calibration_points")
    .select("turn_number,timestamp_sec,x_pct,y_pct")
    .eq("session_id", sessionId)
    .order("timestamp_sec", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toCalibrationPoint(row as CalibrationRow));
}

/** Every boundary frame for the session, ordered in time (used for scrubbing). */
export async function fetchBoundaryFrames(
  sessionId: string,
): Promise<{ timestampSec: number; frame: BoundaryFrame }[]> {
  const { data, error } = await supabase
    .from("boundary_frames")
    .select("timestamp_sec,left_boundary,right_boundary,tire_left,tire_right,breached")
    .eq("session_id", sessionId)
    .order("timestamp_sec", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    timestampSec: Number((row as BoundaryFrameRow).timestamp_sec),
    frame: toBoundaryFrame(row as BoundaryFrameRow),
  }));
}

/** Nearest frame to a scrub position, straight from the REST endpoint. */
export async function fetchBoundaryFrameAt(sessionId: string, t: number): Promise<BoundaryFrame | null> {
  const res = await fetch(`/api/public/sessions/${sessionId}/boundary-frame?t=${encodeURIComponent(t)}`);
  if (!res.ok) return null;
  return (await res.json()) as BoundaryFrame | null;
}

export async function updateViolationStatus(
  sessionId: string,
  violationId: string,
  status: "confirmed" | "dismissed" | "pending",
): Promise<Violation | null> {
  const res = await fetch(`/api/public/sessions/${sessionId}/violations/${violationId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) return null;
  return (await res.json()) as Violation;
}

/** Live updates while the CV service is still uploading batches. */
export function subscribeToSession(
  sessionId: string,
  handlers: {
    onViolation?: (violation: Violation) => void;
    onBoundaryFrame?: (timestampSec: number, frame: BoundaryFrame) => void;
  },
) {
  const channel = supabase
    .channel(`session-${sessionId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "violations", filter: `session_id=eq.${sessionId}` },
      (payload) => {
        const row = payload.new as ViolationRow | null;
        if (row?.id) handlers.onViolation?.(toViolation(row));
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "boundary_frames", filter: `session_id=eq.${sessionId}` },
      (payload) => {
        const row = payload.new as BoundaryFrameRow | null;
        if (row) handlers.onBoundaryFrame?.(Number(row.timestamp_sec), toBoundaryFrame(row));
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Upload onboard footage and open a session for it. */
export async function createSessionFromVideo(file: File, durationSec: number): Promise<SessionSummary | null> {
  const path = `${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  const { error: uploadError } = await supabase.storage.from(VIDEO_BUCKET).upload(path, file);
  if (uploadError) throw new Error(uploadError.message);

  const { data: signed } = await supabase.storage
    .from(VIDEO_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  const res = await fetch("/api/public/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      durationSec,
      videoUrl: signed?.signedUrl,
      // Calibration is sampled over the clip's real length so the circuit dot
      // tracks the footage instead of a hardcoded cycle.
      calibration: buildCalibration(durationSec),
    }),
  });
  if (!res.ok) return null;
  const created = (await res.json()) as { id: string; status: SessionSummary["status"] };
  return {
    id: created.id,
    trackSlug: "tt-assen",
    videoUrl: signed?.signedUrl ?? null,
    durationSec,
    status: created.status,
  };
}

