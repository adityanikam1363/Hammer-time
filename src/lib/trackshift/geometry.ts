/**
 * Pure track-limit geometry math. No I/O, no framework imports — this module is
 * the correctness-critical core and is unit tested in geometry.test.ts.
 */

export interface PixelPoint {
  x: number;
  y: number;
}

export interface QuadraticFit {
  /** x(y) = a*y^2 + b*y + c */
  a: number;
  b: number;
  c: number;
  /** RMS residual of the fit in pixels. */
  rms: number;
}

/** Evaluate a fitted boundary curve at a given y. */
export function evalQuadratic(fit: QuadraticFit, y: number): number {
  return fit.a * y * y + fit.b * y + fit.c;
}

/**
 * Ordinary least squares fit of x = a*y^2 + b*y + c via the normal equations,
 * solved with Gaussian elimination + partial pivoting. Degrades gracefully to a
 * line (2 points) or a constant (1 point).
 */
export function fitQuadratic(points: PixelPoint[]): QuadraticFit {
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length === 0) return { a: 0, b: 0, c: 0, rms: 0 };
  if (pts.length === 1) return { a: 0, b: 0, c: pts[0]!.x, rms: 0 };

  const degree = pts.length === 2 ? 1 : 2;
  const n = degree + 1; // unknowns: [c, b, a] up to degree

  // Normal equations: (A^T A) coeffs = A^T x, with A row = [1, y, y^2]
  const ata: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const atx: number[] = new Array<number>(n).fill(0);

  for (const p of pts) {
    const basis: number[] = [];
    for (let k = 0; k < n; k++) basis.push(Math.pow(p.y, k));
    for (let r = 0; r < n; r++) {
      for (let cIdx = 0; cIdx < n; cIdx++) ata[r]![cIdx]! += basis[r]! * basis[cIdx]!;
      atx[r]! += basis[r]! * p.x;
    }
  }

  const coeffs = solveLinearSystem(ata, atx) ?? new Array<number>(n).fill(0);
  const fit: QuadraticFit = {
    c: coeffs[0] ?? 0,
    b: coeffs[1] ?? 0,
    a: coeffs[2] ?? 0,
    rms: 0,
  };

  let sq = 0;
  for (const p of pts) {
    const d = p.x - evalQuadratic(fit, p.y);
    sq += d * d;
  }
  fit.rms = Math.sqrt(sq / pts.length);
  return fit;
}

/** Gaussian elimination with partial pivoting. Returns null for singular systems. */
function solveLinearSystem(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const m = matrix.map((row, i) => [...row, rhs[i]!]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(m[pivot]![col]!) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r]![col]! / m[col]![col]!;
      if (factor === 0) continue;
      for (let k = col; k <= n; k++) m[r]![k]! -= factor * m[col]![k]!;
    }
  }

  return Array.from({ length: n }, (_, i) => m[i]![n]! / m[i]![i]!);
}

export interface RawFrame {
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

export interface ComputedFrame {
  frameIndex: number;
  timestampSec: number;
  leftBoundary: PixelPoint[];
  rightBoundary: PixelPoint[];
  tireLeft: PixelPoint;
  tireRight: PixelPoint;
  offsetLeftPx: number;
  offsetRightPx: number;
  breached: boolean;
  segConfidence: number;
  /** Normalised RMS residual of the boundary fits, clamped to [0,1]. */
  fitResidual: number;
  frameWidth: number;
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

/**
 * Fit boundaries, measure tire offsets and normalise geometry to 0-1 frame space.
 * Sign convention: offsetLeft < 0 => left tire is outside the left boundary,
 * offsetRight > 0 => right tire is outside the right boundary.
 */
export function computeFrame(raw: RawFrame): ComputedFrame {
  const leftFit = fitQuadratic(raw.leftBoundaryPx);
  const rightFit = fitQuadratic(raw.rightBoundaryPx);

  const offsetLeftPx = raw.tireLeftPx.x - evalQuadratic(leftFit, raw.tireLeftPx.y);
  const offsetRightPx = raw.tireRightPx.x - evalQuadratic(rightFit, raw.tireRightPx.y);

  const norm = (p: PixelPoint): PixelPoint => ({
    x: p.x / raw.frameWidth,
    y: p.y / raw.frameHeight,
  });

  const residualScale = Math.max(raw.frameWidth / 50, 1e-6);
  const fitResidual = clamp01(((leftFit.rms + rightFit.rms) / 2) / residualScale);

  return {
    frameIndex: raw.frameIndex,
    timestampSec: raw.timestampSec,
    leftBoundary: raw.leftBoundaryPx.map(norm),
    rightBoundary: raw.rightBoundaryPx.map(norm),
    tireLeft: norm(raw.tireLeftPx),
    tireRight: norm(raw.tireRightPx),
    offsetLeftPx,
    offsetRightPx,
    breached: offsetLeftPx < 0 || offsetRightPx > 0,
    segConfidence: clamp01(raw.segConfidence),
    fitResidual,
    frameWidth: raw.frameWidth,
  };
}

/** Signed breach magnitude and side for one frame (0 when the frame is clean). */
export function breachOf(frame: ComputedFrame): { side: "left" | "right"; magnitude: number } {
  const left = frame.offsetLeftPx < 0 ? Math.abs(frame.offsetLeftPx) : 0;
  const right = frame.offsetRightPx > 0 ? frame.offsetRightPx : 0;
  return right >= left ? { side: "right", magnitude: right } : { side: "left", magnitude: left };
}

export interface DetectedViolation {
  timestampSec: number;
  frameIndex: number;
  side: "left" | "right";
  offsetPx: number;
  confidence: number;
}

export const DEBOUNCE_WINDOW_SEC = 0.3;
export const REQUIRED_RATIO = 0.6;

export const CONFIDENCE_WEIGHTS = {
  segmentation: 0.4,
  fit: 0.25,
  temporal: 0.2,
  offset: 0.15,
} as const;

/** Composite confidence, clamped to [0,1] and rounded to 2 decimals. */
export function compositeConfidence(input: {
  segConfidence: number;
  fitResidual: number;
  temporalConsistency: number;
  offsetPx: number;
}): number {
  const score =
    CONFIDENCE_WEIGHTS.segmentation * clamp01(input.segConfidence) +
    CONFIDENCE_WEIGHTS.fit * (1 - clamp01(input.fitResidual)) +
    CONFIDENCE_WEIGHTS.temporal * clamp01(input.temporalConsistency) +
    CONFIDENCE_WEIGHTS.offset * Math.min(Math.abs(input.offsetPx) / 50, 1);
  return Math.round(clamp01(score) * 100) / 100;
}

/**
 * Temporal debounce: a frame only counts once at least `REQUIRED_RATIO` of the
 * frames in a ±150ms window are breached. Each sustained excursion yields
 * exactly one violation, anchored at the largest-magnitude frame in it.
 */
export function detectViolations(frames: ComputedFrame[]): DetectedViolation[] {
  const sorted = [...frames].sort((a, b) => a.timestampSec - b.timestampSec);
  if (sorted.length === 0) return [];

  const half = DEBOUNCE_WINDOW_SEC / 2;
  const ratios = sorted.map((frame) => {
    const window = sorted.filter(
      (f) => f.timestampSec >= frame.timestampSec - half && f.timestampSec <= frame.timestampSec + half,
    );
    if (window.length === 0) return 0;
    return window.filter((f) => f.breached).length / window.length;
  });

  const qualified = sorted.map((f, i) => f.breached && (ratios[i] ?? 0) >= REQUIRED_RATIO);

  const violations: DetectedViolation[] = [];
  let i = 0;
  while (i < sorted.length) {
    if (!qualified[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < sorted.length && qualified[j + 1]) j++;

    let anchor = i;
    let best = -1;
    for (let k = i; k <= j; k++) {
      const mag = breachOf(sorted[k]!).magnitude;
      if (mag > best) {
        best = mag;
        anchor = k;
      }
    }

    const frame = sorted[anchor]!;
    const { side, magnitude } = breachOf(frame);
    violations.push({
      timestampSec: frame.timestampSec,
      frameIndex: frame.frameIndex,
      side,
      offsetPx: Math.round(magnitude * 100) / 100,
      confidence: compositeConfidence({
        segConfidence: frame.segConfidence,
        fitResidual: frame.fitResidual,
        temporalConsistency: ratios[anchor] ?? 0,
        offsetPx: magnitude,
      }),
    });

    i = j + 1;
  }

  return violations;
}

export interface CalibrationRow {
  turnNumber: number;
  timestampSec: number;
}

/** Nearest-timestamp turn assignment, mirroring the frontend's carPositionAt. */
export function turnForTimestamp(timestampSec: number, calibration: CalibrationRow[]): number {
  if (calibration.length === 0) return 0;
  let best = calibration[0]!;
  for (const point of calibration) {
    if (Math.abs(point.timestampSec - timestampSec) < Math.abs(best.timestampSec - timestampSec)) {
      best = point;
    }
  }
  return best.turnNumber;
}

/** Stable, human-readable violation id ('V-001'). */
export function violationId(sequence: number): string {
  return `V-${String(sequence).padStart(3, "0")}`;
}
