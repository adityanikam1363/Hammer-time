import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Single source of truth for playback time. Drives the video element (when a
 * clip is loaded), the track-map car dot and the timeline highlight together.
 */
export function useVideoSync(duration: number) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hasSource, setHasSource] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  // Internal clock used when no real footage is loaded yet.
  useEffect(() => {
    if (!playing || hasSource) return;
    lastTickRef.current = performance.now();
    const tick = (now: number) => {
      const delta = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      setCurrentTime((t) => {
        const next = t + delta;
        return next >= duration ? 0 : next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, hasSource, duration]);

  const seek = useCallback((time: number) => {
    const clamped = Math.max(0, time);
    setCurrentTime(clamped);
    const video = videoRef.current;
    if (video && video.src) video.currentTime = clamped;
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    setPlaying((p) => {
      const next = !p;
      if (video && video.src) {
        if (next) void video.play();
        else video.pause();
      }
      return next;
    });
  }, []);

  const attachSource = useCallback((url: string) => {
    const video = videoRef.current;
    if (!video) return;
    video.src = url;
    setHasSource(true);
    setCurrentTime(0);
    setPlaying(false);
  }, []);

  const onTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (video && video.src) setCurrentTime(video.currentTime);
  }, []);

  return {
    videoRef,
    currentTime,
    playing,
    hasSource,
    seek,
    togglePlay,
    attachSource,
    onTimeUpdate,
    setPlaying,
  };
}
