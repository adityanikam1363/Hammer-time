import { confidenceToken, displaySide, formatTime, type Violation } from "@/data/violations";

interface IncidentListProps {
  violations: Violation[];
  selectedId: string | null;
  onSelect: (v: Violation) => void;
  onAction: (id: string, status: "confirmed" | "dismissed") => void;
}

export function IncidentList({ violations, selectedId, onSelect, onAction }: IncidentListProps) {
  return (
    <section className="panel-surface flex min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="label-caps">Incident list</span>
        <span className="num text-[0.65rem] text-muted-foreground">{violations.length} logged</span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-panel">
            <tr className="label-caps text-left">
              <th className="px-4 py-2 font-normal">Time</th>
              <th className="px-2 py-2 font-normal">Turn</th>
              <th className="px-2 py-2 font-normal">Side</th>
              <th className="px-2 py-2 font-normal">Offset</th>
              <th className="px-2 py-2 font-normal">Conf.</th>
              <th className="px-2 py-2 font-normal">Status</th>
              <th className="px-4 py-2 text-right font-normal">Steward</th>
            </tr>
          </thead>
          <tbody>
            {violations.map((v) => (
              <tr
                key={v.id}
                onClick={() => onSelect(v)}
                className={`cursor-pointer border-t border-border transition-colors hover:bg-accent ${
                  v.id === selectedId ? "bg-accent" : ""
                } ${v.status === "dismissed" ? "opacity-45" : ""}`}
              >
                <td className="num px-4 py-2 font-bold">{formatTime(v.timestampSec)}</td>
                <td className="num px-2 py-2">T{v.turnNumber}</td>
                <td className="px-2 py-2 uppercase tracking-widest text-muted-foreground">{displaySide(v.side)}</td>
                <td className="num px-2 py-2">{v.offsetPx} px</td>
                <td className="num px-2 py-2">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2 w-2"
                      style={{ backgroundColor: confidenceToken(v.confidence) }}
                    />
                    {(v.confidence * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="px-2 py-2 text-xs uppercase tracking-[0.16em]">
                  <span
                    className={
                      v.status === "confirmed"
                        ? "text-primary"
                        : v.status === "dismissed"
                          ? "text-muted-foreground"
                          : "text-foreground"
                    }
                  >
                    {v.status}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAction(v.id, "confirmed");
                      }}
                      className="border border-primary px-2 py-1 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAction(v.id, "dismissed");
                      }}
                      className="border border-border px-2 py-1 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                    >
                      Dismiss
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
