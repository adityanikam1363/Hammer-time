import { useEffect, useRef, type RefObject } from "react";
import { displaySide, formatTime, type Violation } from "@/data/violations";
import type { BoundaryFrame } from "@/data/boundary";

interface VideoPanelProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  currentTime: number;
  duration: number;
  playing: boolean;
  hasSource: boolean;
  activeViolation: Violation | null;
  boundaryData: BoundaryFrame | null;
  onTogglePlay: () => void;
  onSeek: (t: number) => void;
  onTimeUpdate: () => void;
  onLoadFile: (url: string) => void;
  /** Raw file pick — used to open a real analysis session for the clip. */
  onSelectFile?: (file: File) => void;
  /** Real clip length once the browser has read the video metadata. */
  onDuration?: (seconds: number) => void;

}

export function VideoPanel({
  videoRef,
  currentTime,
  duration,
  playing,
  hasSource,
  activeViolation,
  boundaryData,
  onTogglePlay,
  onSeek,
  onTimeUpdate,
  onLoadFile,
  onSelectFile,
  onDuration,
}: VideoPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Draws whatever boundary/tire geometry the current frame provides.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = (canvas.width = canvas.clientWidth);
    const h = (canvas.height = canvas.clientHeight);
    ctx.clearRect(0, 0, w, h);
    if (!boundaryData) return;

    const polyline = (pts: { x: number; y: number }[]) => {
      if (pts.length < 2) return;
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * w, p.y * h) : ctx.lineTo(p.x * w, p.y * h)));
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 3;
      ctx.stroke();
    };

    polyline(boundaryData.leftBoundary);
    polyline(boundaryData.rightBoundary);

    const tire = (p: { x: number; y: number }) => {
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 9, 0, Math.PI * 2);
      ctx.fillStyle = boundaryData.breached ? "oklch(0.58 0.235 27.5)" : "rgba(255,255,255,0.9)";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 2;
      ctx.stroke();
    };
    tire(boundaryData.tireLeft);
    tire(boundaryData.tireRight);
  }, [boundaryData]);

  return (
    <section className="panel-surface relative flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="label-caps">Onboard · front tire view</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="border border-border px-2 py-1 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            Load footage
          </button>
          <button
            type="button"
            onClick={() => {
              const url = window.prompt("Video URL");
              if (url) onLoadFile(url);
            }}
            className="border border-border px-2 py-1 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
          >
            URL
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            onLoadFile(URL.createObjectURL(file));
            onSelectFile?.(file);
          }}
        />
      </div>

      <div
        className={`relative min-h-0 flex-1 overflow-hidden bg-black ${activeViolation ? "flash-violation" : ""}`}
      >
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) onDuration?.(d);
          }}
          onSeeking={onTimeUpdate}
          onSeeked={onTimeUpdate}
          controls={hasSource}
          muted
          playsInline
        />
        {!hasSource && (
          <div className="absolute inset-0 flex items-center justify-center bg-[repeating-linear-gradient(180deg,rgba(255,255,255,0.035)_0px,rgba(255,255,255,0.035)_1px,transparent_1px,transparent_4px)]">
            <span className="label-caps">Awaiting onboard feed</span>
          </div>
        )}
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

        {activeViolation && (
          <div className="pointer-events-none absolute left-4 top-4 border border-primary bg-primary/15 px-3 py-1.5 backdrop-blur-sm">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
              Track limits · Turn {activeViolation.turnNumber}
            </div>
            <div className="num text-xs text-foreground">
              {displaySide(activeViolation.side).toUpperCase()} · {activeViolation.offsetPx}px ·{" "}
              {(activeViolation.confidence * 100).toFixed(0)}%
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-border px-4 py-2">
        <button
          type="button"
          onClick={onTogglePlay}
          className="w-16 border border-border px-2 py-1 text-xs font-bold uppercase tracking-[0.16em] text-foreground transition-colors hover:border-primary"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={Math.min(currentTime, duration)}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="h-1 flex-1 cursor-pointer appearance-none bg-muted accent-primary"
          aria-label="Seek footage"
        />
        <span className="num text-xs text-muted-foreground">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    </section>
  );
}
