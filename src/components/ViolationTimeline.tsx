import { confidenceToken, formatTime, type Violation } from "@/data/violations";

interface ViolationTimelineProps {
  violations: Violation[];
  duration: number;
  currentTime: number;
  selectedId: string | null;
  onSeek: (t: number) => void;
  onSelect: (v: Violation) => void;
}

export function ViolationTimeline({
  violations,
  duration,
  currentTime,
  selectedId,
  onSeek,
  onSelect,
}: ViolationTimelineProps) {
  const nearest = violations.reduce<Violation | null>((best, v) => {
    if (!best) return v;
    return Math.abs(v.timestampSec - currentTime) < Math.abs(best.timestampSec - currentTime) ? v : best;
  }, null);
  return (
    <section className="panel-surface px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="label-caps">Violation timeline</span>
        <div className="flex items-center gap-4 text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
          <Legend color="var(--conf-low)" label="Low" />
          <Legend color="var(--conf-mid)" label="Medium" />
          <Legend color="var(--conf-high)" label="High" />
        </div>
      </div>

      <div
        className="relative h-14 cursor-crosshair bg-muted"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          onSeek(((e.clientX - rect.left) / rect.width) * duration);
        }}
      >
        {Array.from({ length: 11 }).map((_, i) => (
          <div
            key={i}
            className="absolute top-0 h-2 w-px bg-border"
            style={{ left: `${i * 10}%` }}
            aria-hidden
          />
        ))}

        {violations.map((v) => (
          <button
            key={v.id}
            type="button"
            title={`${v.id} · Turn ${v.turnNumber} · ${formatTime(v.timestampSec)}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(v);
              onSeek(v.timestampSec);
            }}
            className={`absolute bottom-0 top-2 -translate-x-1/2 transition-transform hover:scale-x-150 ${
              v.id === nearest?.id ? "w-2.5 scale-y-110" : "w-1.5"
            }`}
            style={{
              left: `${(v.timestampSec / duration) * 100}%`,
              backgroundColor: confidenceToken(v.confidence),
              opacity: v.status === "dismissed" ? 0.3 : 1,
              outline:
                v.id === selectedId
                  ? "2px solid var(--color-foreground)"
                  : v.id === nearest?.id
                    ? "1px solid var(--color-foreground)"
                    : "none",
            }}
          />
        ))}

        <div
          className="pointer-events-none absolute inset-y-0 w-px bg-foreground"
          style={{ left: `${Math.min(currentTime / duration, 1) * 100}%` }}
        >
          <div className="absolute -left-1 -top-1 h-2 w-2 rotate-45 bg-foreground" />
        </div>
      </div>
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
