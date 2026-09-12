import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { VideoPanel } from "@/components/VideoPanel";
import { TrackMap } from "@/components/TrackMap";
import { ViolationTimeline } from "@/components/ViolationTimeline";
import { IncidentList } from "@/components/IncidentList";
import { useVideoSync } from "@/hooks/useVideoSync";
import { useTrackshiftSession } from "@/hooks/useTrackshiftSession";
import { MOCK_VIOLATIONS, SESSION_DURATION_SEC, type Violation } from "@/data/violations";
import { mockBoundaryFrame } from "@/data/boundary";
import { setTrackCalibration } from "@/data/calibration";

const TITLE = "TT Assen · Track-Limit Violation Review";
const DESCRIPTION =
  "Broadcast-style steward dashboard for reviewing automatic track-limit violations at TT Circuit Assen: onboard footage, live circuit map, violation timeline and incident actions.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReviewDashboard,
});

function ReviewDashboard() {
  const { session, violations: liveViolations, boundaryAt, setStatus, startSessionFromFile } =
    useTrackshiftSession();

  // Real clip length as reported by the browser once footage is loaded.
  const [clipDuration, setClipDuration] = useState<number | null>(null);
  const duration = session?.durationSec ?? clipDuration ?? SESSION_DURATION_SEC;

  const {
    videoRef,
    currentTime,
    playing,
    hasSource,
    seek,
    togglePlay,
    attachSource,
    onTimeUpdate,
  } = useVideoSync(duration);

  // Local review state is only used while no backend session is connected.
  const [mockViolations, setMockViolations] = useState<Violation[]>(MOCK_VIOLATIONS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const violations = liveViolations ?? mockViolations;
  const usingBackend = Boolean(session && liveViolations);

  useEffect(() => {
    if (session?.videoUrl) attachSource(session.videoUrl);
  }, [session?.videoUrl, attachSource]);

  // Without a backend session, keep the circuit clock on the real clip length.
  useEffect(() => {
    if (!session && clipDuration) setTrackCalibration([], clipDuration);
  }, [session, clipDuration]);

  const handleSelectFile = async (file: File, seconds: number) => {
    try {
      await startSessionFromFile(file, seconds);
    } catch (error) {
      console.error("[dashboard] session creation failed", error);
    }
  };

  const activeViolation = useMemo(
    () =>
      violations.find((v) => Math.abs(v.timestampSec - currentTime) < 1.2 && v.status !== "dismissed") ??
      null,
    [violations, currentTime],
  );

  const pendingCount = violations.filter((v) => v.status === "pending").length;

  const boundaryData = useMemo(
    () => boundaryAt(currentTime) ?? mockBoundaryFrame(currentTime, activeViolation),
    [boundaryAt, currentTime, activeViolation],
  );

  const handleAction = (id: string, status: "confirmed" | "dismissed") => {
    if (usingBackend) {
      void setStatus(id, status);
      return;
    }
    setMockViolations((list) => list.map((v) => (v.id === id ? { ...v, status } : v)));
  };

  const handleSelect = (v: Violation) => {
    setSelectedId(v.id);
    seek(v.timestampSec);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <TopBar currentTime={currentTime} live={playing} pendingCount={pendingCount} />

      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <div className="grid shrink-0 grid-cols-1 gap-3 lg:grid-cols-2 [&>*]:h-[22rem] lg:[&>*]:h-[26rem]">
          <VideoPanel
            videoRef={videoRef}
            currentTime={currentTime}
            duration={duration}
            playing={playing}
            hasSource={hasSource}
            activeViolation={activeViolation}
            boundaryData={boundaryData}
            onTogglePlay={togglePlay}
            onSeek={seek}
            onTimeUpdate={onTimeUpdate}
            onLoadFile={attachSource}
            onSelectFile={(file) => setPendingFile(file)}
            onDuration={(seconds) => {
              setClipDuration(seconds);
              const file = pendingFile;
              if (file) {
                setPendingFile(null);
                void handleSelectFile(file, seconds);
              }
            }}
          />
          <TrackMap
            currentTime={currentTime}
            violations={violations}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        </div>

        <ViolationTimeline
          violations={violations}
          duration={duration}
          currentTime={currentTime}
          selectedId={selectedId}
          onSeek={seek}
          onSelect={(v) => setSelectedId(v.id)}
        />

        <div className="h-[20rem] shrink-0">
          <IncidentList
            violations={violations}
            selectedId={selectedId}
            onSelect={handleSelect}
            onAction={handleAction}
          />
        </div>
      </main>
    </div>
  );
}
