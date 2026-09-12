import { describe, expect, it } from "vitest";
import {
  compositeConfidence,
  computeFrame,
  detectViolations,
  evalQuadratic,
  fitQuadratic,
  turnForTimestamp,
  type RawFrame,
} from "./geometry";

describe("fitQuadratic", () => {
  it("recovers an exact quadratic", () => {
    // x = 2y^2 - 3y + 5
    const pts = [0, 1, 2, 3, 4].map((y) => ({ x: 2 * y * y - 3 * y + 5, y }));
    const fit = fitQuadratic(pts);
    expect(fit.a).toBeCloseTo(2, 6);
    expect(fit.b).toBeCloseTo(-3, 6);
    expect(fit.c).toBeCloseTo(5, 6);
    expect(fit.rms).toBeCloseTo(0, 6);
    expect(evalQuadratic(fit, 10)).toBeCloseTo(2 * 100 - 30 + 5, 5);
  });

  it("fits a line through two points and reports zero residual", () => {
    const fit = fitQuadratic([
      { x: 10, y: 0 },
      { x: 30, y: 10 },
    ]);
    expect(evalQuadratic(fit, 5)).toBeCloseTo(20, 6);
    expect(fit.rms).toBeCloseTo(0, 6);
  });

  it("reports a non-zero residual for noisy input", () => {
    const fit = fitQuadratic([
      { x: 0, y: 0 },
      { x: 4, y: 1 },
      { x: 8, y: 2 },
      { x: 20, y: 3 },
    ]);
    expect(fit.rms).toBeGreaterThan(0);
  });
});

const straightFrame = (
  frameIndex: number,
  timestampSec: number,
  tireLeftX: number,
  tireRightX: number,
): RawFrame => ({
  frameIndex,
  timestampSec,
  // Vertical boundaries at x = 100 and x = 900.
  leftBoundaryPx: [0, 250, 500, 750, 1000].map((y) => ({ x: 100, y })),
  rightBoundaryPx: [0, 250, 500, 750, 1000].map((y) => ({ x: 900, y })),
  tireLeftPx: { x: tireLeftX, y: 800 },
  tireRightPx: { x: tireRightX, y: 800 },
  segConfidence: 0.9,
  frameWidth: 1000,
  frameHeight: 1000,
});

describe("computeFrame", () => {
  it("computes hand-checked offsets and normalises geometry", () => {
    const f = computeFrame(straightFrame(0, 0, 130, 870));
    expect(f.offsetLeftPx).toBeCloseTo(30, 6);
    expect(f.offsetRightPx).toBeCloseTo(-30, 6);
    expect(f.breached).toBe(false);
    expect(f.tireLeft).toEqual({ x: 0.13, y: 0.8 });
    expect(f.fitResidual).toBeCloseTo(0, 6);
  });

  it("flags a breach when the right tire crosses the right boundary", () => {
    const f = computeFrame(straightFrame(0, 0, 130, 934));
    expect(f.offsetRightPx).toBeCloseTo(34, 6);
    expect(f.breached).toBe(true);
  });

  it("flags a breach when the left tire crosses the left boundary", () => {
    const f = computeFrame(straightFrame(0, 0, 88, 870));
    expect(f.offsetLeftPx).toBeCloseTo(-12, 6);
    expect(f.breached).toBe(true);
  });
});

describe("compositeConfidence", () => {
  it("matches a hand-computed weighted sum", () => {
    // 0.4*0.9 + 0.25*(1-0.2) + 0.2*1 + 0.15*(34/50) = 0.36+0.2+0.2+0.102 = 0.862
    expect(
      compositeConfidence({
        segConfidence: 0.9,
        fitResidual: 0.2,
        temporalConsistency: 1,
        offsetPx: 34,
      }),
    ).toBe(0.86);
  });

  it("clamps the offset term at 50px and stays within [0,1]", () => {
    const big = compositeConfidence({
      segConfidence: 1,
      fitResidual: 0,
      temporalConsistency: 1,
      offsetPx: 5000,
    });
    expect(big).toBe(1);
  });
});

describe("detectViolations", () => {
  const at30fps = (index: number) => index / 30;

  it("ignores a single flicker frame", () => {
    const frames = Array.from({ length: 30 }, (_, i) =>
      computeFrame(straightFrame(i, at30fps(i), 130, i === 15 ? 940 : 870)),
    );
    expect(detectViolations(frames)).toHaveLength(0);
  });

  it("emits exactly one violation for a sustained excursion, anchored at the largest offset", () => {
    const frames = Array.from({ length: 40 }, (_, i) => {
      const off = i >= 10 && i <= 25;
      const tireRight = off ? (i === 18 ? 957 : 920) : 870;
      return computeFrame(straightFrame(i, at30fps(i), 130, tireRight));
    });

    const found = detectViolations(frames);
    expect(found).toHaveLength(1);
    expect(found[0]!.side).toBe("right");
    expect(found[0]!.frameIndex).toBe(18);
    expect(found[0]!.offsetPx).toBeCloseTo(57, 5);
    expect(found[0]!.confidence).toBeGreaterThan(0.8);
  });

  it("separates two distinct excursions", () => {
    const frames = Array.from({ length: 90 }, (_, i) => {
      const off = (i >= 10 && i <= 24) || (i >= 60 && i <= 74);
      return computeFrame(straightFrame(i, at30fps(i), off && i > 50 ? 60 : 130, off && i <= 50 ? 930 : 870));
    });
    const found = detectViolations(frames);
    expect(found).toHaveLength(2);
    expect(found[0]!.side).toBe("right");
    expect(found[1]!.side).toBe("left");
  });
});

describe("turnForTimestamp", () => {
  it("picks the nearest calibration point", () => {
    const cal = [
      { turnNumber: 1, timestampSec: 10 },
      { turnNumber: 2, timestampSec: 20 },
      { turnNumber: 3, timestampSec: 30 },
    ];
    expect(turnForTimestamp(9, cal)).toBe(1);
    expect(turnForTimestamp(26, cal)).toBe(3);
  });
});
