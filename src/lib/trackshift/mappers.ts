import type { BoundaryFrame, BoundaryPoint } from "@/data/boundary";
import type { CalibrationPoint } from "@/data/calibration";
import type { Violation } from "@/data/violations";

/** Row shapes as they come back from the database (snake_case, jsonb columns). */
export interface ViolationRow {
  id: string;
  timestamp_sec: number | string;
  turn_number: number;
  side: string;
  offset_px: number | string;
  confidence: number | string;
  clip_url: string | null;
  status: string;
}

export interface BoundaryFrameRow {
  timestamp_sec: number | string;
  left_boundary: unknown;
  right_boundary: unknown;
  tire_left: unknown;
  tire_right: unknown;
  breached: boolean;
}

export interface CalibrationRow {
  turn_number: number;
  timestamp_sec: number | string;
  x_pct: number | string;
  y_pct: number | string;
}

const num = (value: number | string): number =>
  typeof value === "number" ? value : Number.parseFloat(value);

const points = (value: unknown): BoundaryPoint[] =>
  Array.isArray(value)
    ? value
        .filter((p): p is { x: number; y: number } => Boolean(p) && typeof p === "object")
        .map((p) => ({ x: Number(p.x), y: Number(p.y) }))
    : [];

const point = (value: unknown): BoundaryPoint => {
  const p = value as { x?: number; y?: number } | null;
  return { x: Number(p?.x ?? 0), y: Number(p?.y ?? 0) };
};

export function toViolation(row: ViolationRow): Violation {
  return {
    id: row.id,
    timestampSec: num(row.timestamp_sec),
    turnNumber: row.turn_number,
    side: row.side === "left" ? "left" : "right",
    offsetPx: num(row.offset_px),
    confidence: num(row.confidence),
    ...(row.clip_url ? { clipUrl: row.clip_url } : {}),
    status:
      row.status === "confirmed" ? "confirmed" : row.status === "dismissed" ? "dismissed" : "pending",
  };
}

export function toBoundaryFrame(row: BoundaryFrameRow): BoundaryFrame {
  return {
    leftBoundary: points(row.left_boundary),
    rightBoundary: points(row.right_boundary),
    tireLeft: point(row.tire_left),
    tireRight: point(row.tire_right),
    breached: Boolean(row.breached),
  };
}

export function toCalibrationPoint(row: CalibrationRow): CalibrationPoint {
  return {
    timestampSec: num(row.timestamp_sec),
    turnNumber: row.turn_number,
    xPct: num(row.x_pct),
    yPct: num(row.y_pct),
  };
}
