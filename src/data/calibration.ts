import { TRACK_VIEWBOX } from "@/data/tt-assen";
import { SESSION_DURATION_SEC } from "@/data/violations";
import { buildCalibration } from "@/lib/trackshift/calibration";

const VB = TRACK_VIEWBOX.split(" ").map(Number);
const VB_W = VB[2] ?? 1000;
const VB_H = VB[3] ?? 1000;

export interface CalibrationPoint {
  timestampSec: number;
  turnNumber: number;
  xPct: number;
  yPct: number;
}

/** Fallback calibration used only while no real session is loaded. */
export const TRACK_CALIBRATION: CalibrationPoint[] = buildCalibration(SESSION_DURATION_SEC);

let activeCalibration: CalibrationPoint[] = TRACK_CALIBRATION;
let activeCycleSec = SESSION_DURATION_SEC;

/**
 * Swap in the session's real calibration. `durationSec` is the clip length the
 * points were sampled over — the car dot wraps on it, so playback and the map
 * stay in sync with the actual footage.
 */
export function setTrackCalibration(points: CalibrationPoint[], durationSec?: number) {
  if (points.length > 0) {
    activeCalibration = [...points].sort((a, b) => a.timestampSec - b.timestampSec);
    const last = activeCalibration[activeCalibration.length - 1] as CalibrationPoint;
    const span = last.timestampSec / Math.max(activeCalibration.length - 1, 1);
    activeCycleSec =
      durationSec && durationSec > 0 ? durationSec : Math.max(last.timestampSec + span, 0.001);
    return;
  }

  // No backend calibration: derive one from the real duration when we know it.
  activeCycleSec = durationSec && durationSec > 0 ? durationSec : SESSION_DURATION_SEC;
  activeCalibration = buildCalibration(activeCycleSec);
}

/** Length of one calibration cycle in seconds. */
export function calibrationCycleSec() {
  return activeCycleSec;
}

export function activeCalibrationPoints(): CalibrationPoint[] {
  return activeCalibration;
}

function catmullRom(a: number, b: number, c: number, d: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
  );
}

export interface CarPosition {
  xPct: number;
  yPct: number;
  turnNumber: number;
}

/** Interpolated car position for a given session time (wraps at cycle end). */
export function carPositionAt(timeSec: number): CarPosition {
  const pts = activeCalibration;
  if (pts.length === 0) return { xPct: 50, yPct: 50, turnNumber: 0 };

  const cycle = activeCycleSec > 0 ? activeCycleSec : 1;
  const t = ((timeSec % cycle) + cycle) % cycle;

  let i = 0;
  for (let k = 0; k < pts.length; k++) if ((pts[k] as CalibrationPoint).timestampSec <= t) i = k;
  const a = pts[i] as CalibrationPoint;
  const b = pts[(i + 1) % pts.length] as CalibrationPoint;
  const previous = pts[(i - 1 + pts.length) % pts.length] as CalibrationPoint;
  const next = pts[(i + 2) % pts.length] as CalibrationPoint;
  const end = i + 1 === pts.length ? cycle : b.timestampSec;
  const span = Math.max(end - a.timestampSec, 0.0001);
  const f = Math.min(Math.max((t - a.timestampSec) / span, 0), 1);

  return {
    xPct: catmullRom(previous.xPct, a.xPct, b.xPct, next.xPct, f),
    yPct: catmullRom(previous.yPct, a.yPct, b.yPct, next.yPct, f),
    turnNumber: f < 0.5 ? a.turnNumber : b.turnNumber,
  };
}

/** Convert a percentage position back into SVG user units. */
export function pctToViewBox(xPct: number, yPct: number) {
  return { x: (xPct / 100) * VB_W, y: (yPct / 100) * VB_H };
}
