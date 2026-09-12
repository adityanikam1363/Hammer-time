import { TRACK_VIEWBOX, TURN_MARKERS } from "@/data/tt-assen";

const VB = TRACK_VIEWBOX.split(" ").map(Number);
const VB_W = VB[2] ?? 1000;
const VB_H = VB[3] ?? 1000;

export interface GeneratedCalibrationPoint {
  turnNumber: number;
  timestampSec: number;
  xPct: number;
  yPct: number;
}

/**
 * Build a timestamp -> turn -> map-position calibration for a real clip.
 *
 * The circuit's turn markers are spread across the clip's *actual* duration,
 * so the car dot and the footage stay locked together instead of drifting
 * against a hardcoded cycle length. Turn 0 is reserved for start/finish ("N").
 * One point per turn (the store keys calibration by session + turn).
 */
export function buildCalibration(durationSec: number): GeneratedCalibrationPoint[] {
  const duration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 1;

  return TURN_MARKERS.map((m, i) => ({
    turnNumber: m.label === "N" ? 0 : Number(m.label),
    timestampSec: Math.round(((i / TURN_MARKERS.length) * duration) * 1000) / 1000,
    xPct: Math.round((m.x / VB_W) * 100000) / 1000,
    yPct: Math.round((m.y / VB_H) * 100000) / 1000,
  }));
}


export { VB_W, VB_H };
