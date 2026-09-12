export interface Violation {
  id: string;
  timestampSec: number;
  turnNumber: number;
  side: "left" | "right";
  offsetPx: number;
  confidence: number;
  clipUrl?: string;
  status: "pending" | "confirmed" | "dismissed";
}

export function displaySide(side: Violation["side"]): Violation["side"] {
  return side === "left" ? "right" : "left";
}

export const SESSION_DURATION_SEC = 214;

export const MOCK_VIOLATIONS: Violation[] = [
  { id: "V-001", timestampSec: 12.4, turnNumber: 1, side: "right", offsetPx: 34, confidence: 0.94, status: "pending" },
  { id: "V-002", timestampSec: 27.9, turnNumber: 3, side: "left", offsetPx: 12, confidence: 0.51, status: "pending" },
  { id: "V-003", timestampSec: 48.2, turnNumber: 5, side: "right", offsetPx: 41, confidence: 0.88, status: "pending" },
  { id: "V-004", timestampSec: 66.7, turnNumber: 7, side: "left", offsetPx: 19, confidence: 0.72, status: "pending" },
  { id: "V-005", timestampSec: 91.3, turnNumber: 9, side: "right", offsetPx: 57, confidence: 0.97, status: "pending" },
  { id: "V-006", timestampSec: 113.8, turnNumber: 11, side: "left", offsetPx: 8, confidence: 0.44, status: "pending" },
  { id: "V-007", timestampSec: 132.5, turnNumber: 13, side: "right", offsetPx: 28, confidence: 0.81, status: "pending" },
  { id: "V-008", timestampSec: 154.1, turnNumber: 15, side: "left", offsetPx: 46, confidence: 0.91, status: "pending" },
  { id: "V-009", timestampSec: 176.6, turnNumber: 18, side: "right", offsetPx: 22, confidence: 0.66, status: "pending" },
  { id: "V-010", timestampSec: 198.4, turnNumber: 21, side: "left", offsetPx: 37, confidence: 0.86, status: "pending" },
];

export function confidenceToken(confidence: number): string {
  if (confidence >= 0.8) return "var(--conf-high)";
  if (confidence >= 0.6) return "var(--conf-mid)";
  return "var(--conf-low)";
}

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}
