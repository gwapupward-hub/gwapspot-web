"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ABSOLUTE_PLAYBACK_DEADLINE_MS,
  RESUME_RECOVERY_DEADLINE_MS,
  shouldAttemptResumeRecovery,
  shouldRevealOnAbsoluteDeadline,
  shouldRevealOnStartup,
  shouldShowEnterOnProgress,
  STALL_RECOVERY_DEADLINE_MS,
  STARTUP_PROGRESS_DEADLINE_MS,
} from "./splash-fallback";
import styles from "./splash.module.css";

const VIDEO_URL =
  "https://res.cloudinary.com/dg1u1wpdu/video/upload/q_auto:good/v1788007506/gwap-os-app-splash.mp4";
const POSTER_URL =
  "https://res.cloudinary.com/dg1u1wpdu/video/upload/so_10.0,q_auto:good,f_jpg/v1788007506/gwap-os-app-splash.jpg";

export function GwapOsSplash() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stallTimerRef = useRef<number | null>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const [showEnter, setShowEnter] = useState(false);
  const showEnterRef = useRef(false);
  const playbackFailedRef = useRef(false);
  const [playbackFailed, setPlaybackFailed] = useState(false);

  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current === null) return;
    window.clearTimeout(stallTimerRef.current);
    stallTimerRef.current = null;
  }, []);

  const clearResumeTimer = useCallback(() => {
    if (resumeTimerRef.current === null) return;
    window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = null;
  }, []);

  const revealEnter = useCallback(() => {
    showEnterRef.current = true;
    setShowEnter(true);
  }, []);

  const revealFinalFrame = useCallback(() => {
    clearStallTimer();
    clearResumeTimer();
    playbackFailedRef.current = true;
    setPlaybackFailed(true);
    revealEnter();
  }, [clearResumeTimer, clearStallTimer, revealEnter]);

  useEffect(() => {
    const video = videoRef.current;
    if (
      !video ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const fallbackTimer = window.setTimeout(revealFinalFrame, 0);
      return () => window.clearTimeout(fallbackTimer);
    }

    const startupTimer = window.setTimeout(() => {
      if (shouldRevealOnStartup(video)) revealFinalFrame();
    }, STARTUP_PROGRESS_DEADLINE_MS);
    const absoluteTimer = window.setTimeout(() => {
      if (shouldRevealOnAbsoluteDeadline(video)) revealFinalFrame();
    }, ABSOLUTE_PLAYBACK_DEADLINE_MS);
    let rejectedPlaybackTimer: number | null = null;

    try {
      const playback = video.play();
      if (playback) void playback.catch(revealFinalFrame);
    } catch {
      rejectedPlaybackTimer = window.setTimeout(revealFinalFrame, 0);
    }

    // Wallet WebViews frequently freeze <video> playback while backgrounded and
    // may never emit `stalled`/`ended` on return. On foreground, try to resume
    // and fall back to the held final frame if playback stays frozen.
    const handleResume = () => {
      const current = videoRef.current;
      if (
        !current ||
        !shouldAttemptResumeRecovery({
          enterVisible: showEnterRef.current,
          playbackFailed: playbackFailedRef.current,
          video: current,
        })
      ) {
        return;
      }
      try {
        const playback = current.play();
        if (playback) void playback.catch(() => undefined);
      } catch {
        // Ignore; the recovery timer below handles a persistently frozen video.
      }
      clearResumeTimer();
      resumeTimerRef.current = window.setTimeout(() => {
        const latest = videoRef.current;
        if (
          latest &&
          shouldAttemptResumeRecovery({
            enterVisible: showEnterRef.current,
            playbackFailed: playbackFailedRef.current,
            video: latest,
          })
        ) {
          revealFinalFrame();
        }
      }, RESUME_RECOVERY_DEADLINE_MS);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") handleResume();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pageshow", handleResume);
    window.addEventListener("focus", handleResume);

    return () => {
      window.clearTimeout(startupTimer);
      window.clearTimeout(absoluteTimer);
      if (rejectedPlaybackTimer !== null) {
        window.clearTimeout(rejectedPlaybackTimer);
      }
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pageshow", handleResume);
      window.removeEventListener("focus", handleResume);
      clearStallTimer();
      clearResumeTimer();
    };
  }, [clearResumeTimer, clearStallTimer, revealFinalFrame]);

  function handleStalledPlayback() {
    clearStallTimer();
    stallTimerRef.current = window.setTimeout(
      revealFinalFrame,
      STALL_RECOVERY_DEADLINE_MS,
    );
  }

  return (
    <main className={styles.shell} aria-label="GWAP OS entrance">
      <div
        className={styles.poster}
        style={{ backgroundImage: `url(${POSTER_URL})` }}
        aria-hidden="true"
      />

      {!playbackFailed ? (
        <video
          ref={videoRef}
          className={styles.video}
          src={VIDEO_URL}
          poster={POSTER_URL}
          autoPlay
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          onPlaying={clearStallTimer}
          onStalled={handleStalledPlayback}
          onTimeUpdate={(event) => {
            if (shouldShowEnterOnProgress(event.currentTarget)) revealEnter();
          }}
          onEnded={revealEnter}
          onError={revealFinalFrame}
        />
      ) : null}

      <div className={styles.vignette} aria-hidden="true" />

      <div
        className={`${styles.entryWrap} ${showEnter ? styles.entryVisible : ""}`}
      >
        <Link
          href="/app"
          className={styles.enterButton}
          prefetch
          aria-label="Enter Tha GwapSpot"
        >
          <span className={styles.srOnly}>Enter Tha GwapSpot</span>
        </Link>
      </div>
    </main>
  );
}
