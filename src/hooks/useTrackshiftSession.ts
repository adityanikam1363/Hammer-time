import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createSessionFromVideo,
  fetchBoundaryFrames,
  fetchCalibration,
  fetchLatestSession,
  fetchViolations,
  subscribeToSession,
  updateViolationStatus,
  type SessionSummary,
} from "@/lib/api/trackshift";
import { setTrackCalibration } from "@/data/calibration";
import type { BoundaryFrame } from "@/data/boundary";
import type { Violation } from "@/data/violations";

interface TimedFrame {
  timestampSec: number;
  frame: BoundaryFrame;
}

/**
 * Loads the live session (violations, calibration, overlay geometry) and keeps
 * it in sync through realtime. Returns nulls while no backend session exists so
 * the dashboard can keep running on mock data.
 */
export function useTrackshiftSession() {
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [violations, setViolations] = useState<Violation[] | null>(null);
  const [frames, setFrames] = useState<TimedFrame[]>([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadSession = useCallback(async (next: SessionSummary) => {
    const [nextViolations, calibration, boundaryFrames] = await Promise.all([
      fetchViolations(next.id).catch(() => [] as Violation[]),
      fetchCalibration(next.id).catch(() => []),
      fetchBoundaryFrames(next.id).catch(() => [] as TimedFrame[]),
    ]);
    if (!mounted.current) return;
    // Anchor the map clock to this clip's real length.
    setTrackCalibration(calibration, next.durationSec);
    setViolations(nextViolations);
    setFrames(boundaryFrames);

  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const latest = await fetchLatestSession();
      if (cancelled || !mounted.current) return;
      setSession(latest);
      if (latest) await loadSession(latest);
      if (mounted.current) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSession]);

  useEffect(() => {
    if (!session) return;
    return subscribeToSession(session.id, {
      onViolation: (violation) =>
        setViolations((list) => {
          const base = list ?? [];
          const without = base.filter((v) => v.id !== violation.id);
          return [...without, violation].sort((a, b) => a.timestampSec - b.timestampSec);
        }),
      onBoundaryFrame: (timestampSec, frame) =>
        setFrames((list) => {
          const without = list.filter((f) => f.timestampSec !== timestampSec);
          return [...without, { timestampSec, frame }].sort((a, b) => a.timestampSec - b.timestampSec);
        }),
    });
  }, [session]);

  const boundaryAt = useCallback(
    (timeSec: number): BoundaryFrame | null => {
      if (frames.length === 0) return null;
      let best = frames[0]!;
      for (const candidate of frames) {
        if (Math.abs(candidate.timestampSec - timeSec) < Math.abs(best.timestampSec - timeSec)) {
          best = candidate;
        }
      }
      return best.frame;
    },
    [frames],
  );

  const setStatus = useCallback(
    async (id: string, status: "confirmed" | "dismissed") => {
      setViolations((list) => (list ?? []).map((v) => (v.id === id ? { ...v, status } : v)));
      if (session) await updateViolationStatus(session.id, id, status);
    },
    [session],
  );

  const startSessionFromFile = useCallback(async (file: File, durationSec: number) => {
    const created = await createSessionFromVideo(file, durationSec);
    if (created && mounted.current) {
      setSession(created);
      await loadSession(created);
    }
    return created;
  }, [loadSession]);

  return useMemo(
    () => ({ session, violations, boundaryAt, setStatus, startSessionFromFile, loading }),
    [session, violations, boundaryAt, setStatus, startSessionFromFile, loading],
  );
}
