import { formatTime } from "@/data/violations";

interface TopBarProps {
  currentTime: number;
  live: boolean;
  pendingCount: number;
}

export function TopBar({ currentTime, live, pendingCount }: TopBarProps) {
  return (
    <header className="flex items-center justify-between gap-6 border-b border-border bg-panel px-5 py-3">
      <div className="flex items-baseline gap-4">
        <div className="h-6 w-1.5 bg-primary" aria-hidden />
        <h1 className="text-2xl font-bold uppercase tracking-[0.22em] text-foreground">HAMMER TIME</h1>
        <span className="label-caps hidden sm:inline">Track-limit review</span>
      </div>

      <div className="flex items-center gap-6">
        <div className="text-right">
          <div className="label-caps">Session</div>
          <div className="num text-2xl font-bold leading-none text-foreground">{formatTime(currentTime)}</div>
        </div>
        <div className="text-right">
          <div className="label-caps">Pending</div>
          <div className="num text-2xl font-bold leading-none text-primary">
            {String(pendingCount).padStart(2, "0")}
          </div>
        </div>
        <div
          className={`flex items-center gap-2 border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.2em] ${
            live ? "border-primary text-primary" : "border-border text-muted-foreground"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${live ? "bg-primary live-dot" : "bg-muted-foreground"}`} />
          {live ? "Live" : "Replay"}
        </div>
      </div>
    </header>
  );
}
