import type { Violation } from "@/data/violations";

/**
 * Per-frame overlay geometry. All coordinates are normalised 0-1 relative to the
 * video frame, so a real detection backend can stream these straight in.
 */
export interface BoundaryPoint {
  x: number;
  y: number;
}

export interface BoundaryFrame {
  leftBoundary: BoundaryPoint[];
  rightBoundary: BoundaryPoint[];
  tireLeft: BoundaryPoint;
  tireRight: BoundaryPoint;
  breached: boolean;
}

/** Mock generator — replace with real per-frame detection data later. */
export function mockBoundaryFrame(timeSec: number, active: Violation | null): BoundaryFrame {
  const sway = Math.sin(timeSec * 1.4) * 0.04;
  const drift = active ? (active.side === "left" ? -1 : 1) * 0.05 : 0;

  const strand = (topX: number, botX: number): BoundaryPoint[] =>
    Array.from({ length: 6 }, (_, i) => {
      const f = i / 5;
      return { x: topX + (botX - topX) * f + sway * f, y: 0.42 + 0.58 * f };
    });

  return {
    leftBoundary: strand(0.34 + sway * 0.4, 0.06),
    rightBoundary: strand(0.66 + sway * 0.4, 0.94),
    tireLeft: { x: 0.34 + sway + drift, y: 0.82 },
    tireRight: { x: 0.66 + sway + drift, y: 0.82 },
    breached: Boolean(active),
  };
}
