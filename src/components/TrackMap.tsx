import { MAIN_PATH, TRACK_PATHS, TRACK_VIEWBOX, TURN_MARKERS } from "@/data/tt-assen";
import { calibrationCycleSec, carPositionAt, pctToViewBox } from "@/data/calibration";
import { confidenceToken, type Violation } from "@/data/violations";
import { useLayoutEffect, useRef, useState } from "react";

interface TrackMapProps {
  currentTime: number;
  violations: Violation[];
  selectedId: string | null;
  onSelect: (v: Violation) => void;
}

/**
 * Pin placement: prefer the violation's own timestamp on the session
 * calibration (works for start/finish, i.e. turn 0, and for any turn the SVG
 * has no label for); fall back to the labelled turn marker.
 */
const pinPoint = (v: Violation) => {
  const marker = TURN_MARKERS.find((m) => m.label === String(v.turnNumber));
  if (marker) return { x: marker.x, y: marker.y };
  const pos = carPositionAt(v.timestampSec);
  return pctToViewBox(pos.xPct, pos.yPct);
};

export function TrackMap({ currentTime, violations, selectedId, onSelect }: TrackMapProps) {
  const simulationPathRef = useRef<SVGPathElement | null>(null);
  const [car, setCar] = useState<{ x: number; y: number } | null>(null);
  const [pathLength, setPathLength] = useState(0);
  const pos = carPositionAt(currentTime);

  useLayoutEffect(() => {
    const path = simulationPathRef.current;
    if (!path) return;
    setPathLength(path.getTotalLength());
  }, []);

  useLayoutEffect(() => {
    const path = simulationPathRef.current;
    if (!path || pathLength <= 0) return;

    const progress = Math.min(Math.max(currentTime / Math.max(calibrationCycleSec(), 0.001), 0), 1);
    const point = path.getPointAtLength(progress * pathLength);
    const track = TRACK_PATHS[3];
    if (!track) return;
    setCar({ x: point.x + track.dx, y: point.y + track.dy });
  }, [currentTime, pathLength]);

  return (
    <section className="panel-surface flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="label-caps">Circuit · TT Assen</span>
        <span className="num text-[0.65rem] text-muted-foreground">
          4.542 km · 21 turns · {pos.turnNumber ? `T${pos.turnNumber}` : "start/finish"}
        </span>
      </div>

      <div className="relative min-h-0 flex-1 p-3">
        <svg
          viewBox={TRACK_VIEWBOX}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)]"
          role="img"
          aria-label="TT Assen circuit map"
        >
          {TRACK_PATHS.map((p, i) => (
            <g key={`casing-${i}`} transform={`translate(${p.dx} ${p.dy})`}>
              <path
                d={p.d}
                fill="none"
                stroke="var(--color-track-line)"
                strokeOpacity={0.18}
                strokeWidth={p.width + 8}
                strokeLinejoin="round"
              />
              <path
                d={p.d}
                fill="none"
                stroke="var(--color-track-line)"
                strokeWidth={p.width}
                strokeLinejoin="round"
                ref={i === 3 ? simulationPathRef : undefined}
              />
            </g>
          ))}

          <g transform={`translate(${MAIN_PATH.dx} ${MAIN_PATH.dy})`} />

          {TURN_MARKERS.map((m) => (
            <text
              key={m.label}
              x={m.x}
              y={m.y}
              fontSize={34}
              fontFamily="var(--font-mono)"
              fill="var(--color-muted-foreground)"
            >
              {m.label}
            </text>
          ))}

          {violations.map((v) => {
            const pt = pinPoint(v);

            const selected = v.id === selectedId;
            const dismissed = v.status === "dismissed";
            return (
              <g
                key={v.id}
                transform={`translate(${pt.x - 10} ${pt.y - 30})`}
                onClick={() => onSelect(v)}
                className="cursor-pointer"
                opacity={dismissed ? 0.3 : 1}
              >
                <circle
                  r={selected ? 20 : 14}
                  fill={dismissed ? "var(--color-muted-foreground)" : confidenceToken(v.confidence)}
                  stroke="var(--color-background)"
                  strokeWidth={4}
                />
                {v.status === "confirmed" && (
                  <circle r={22} fill="none" stroke="var(--color-foreground)" strokeWidth={2} />
                )}
                {selected && (
                  <circle
                    r={30}
                    fill="none"
                    stroke={confidenceToken(v.confidence)}
                    strokeWidth={3}
                  />
                )}
              </g>
            );
          })}

          {car && (
            <g transform={`translate(${car.x} ${car.y})`}>
              <circle r={26} fill="var(--color-primary)" fillOpacity={0.22} />
              <circle r={12} fill="var(--color-primary)" stroke="white" strokeWidth={4} />
            </g>
          )}
        </svg>
      </div>
    </section>
  );
}
