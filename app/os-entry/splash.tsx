"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./splash.module.css";

const VIDEO_URL =
  "https://res.cloudinary.com/dg1u1wpdu/video/upload/q_auto:good/v1788007506/gwap-os-app-splash.mp4";
const POSTER_URL =
  "https://res.cloudinary.com/dg1u1wpdu/video/upload/so_10.0,q_auto:good,f_jpg/v1788007506/gwap-os-app-splash.jpg";
const STARTUP_PROGRESS_DEADLINE_MS = 2_500;
const STALL_RECOVERY_DEADLINE_MS = 2_500;
const ABSOLUTE_PLAYBACK_DEADLINE_MS = 15_000;

export function GwapOsSplash() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stallTimerRef = useRef<number | null>(null);
  const [showEnter, setShowEnter] = useState(false);
  const [playbackFailed, setPlaybackFailed] = useState(false);

  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current === null) return;
    window.clearTimeout(stallTimerRef.current);
    stallTimerRef.current = null;
  }, []);

  const revealFinalFrame = useCallback(() => {
    clearStallTimer();
    setPlaybackFailed(true);
    setShowEnter(true);
  }, [clearStallTimer]);

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
      if (video.currentTime < 0.15 || video.paused) revealFinalFrame();
    }, STARTUP_PROGRESS_DEADLINE_MS);
    const absoluteTimer = window.setTimeout(() => {
      if (!video.ended && (!video.duration || video.currentTime < video.duration - 1.15)) {
        revealFinalFrame();
      }
    }, ABSOLUTE_PLAYBACK_DEADLINE_MS);
    let rejectedPlaybackTimer: number | null = null;

    try {
      const playback = video.play();
      if (playback) void playback.catch(revealFinalFrame);
    } catch {
      rejectedPlaybackTimer = window.setTimeout(revealFinalFrame, 0);
    }

    return () => {
      window.clearTimeout(startupTimer);
      window.clearTimeout(absoluteTimer);
      if (rejectedPlaybackTimer !== null) {
        window.clearTimeout(rejectedPlaybackTimer);
      }
      clearStallTimer();
    };
  }, [clearStallTimer, revealFinalFrame]);

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
            const video = event.currentTarget;
            if (video.duration && video.duration - video.currentTime <= 1.15) {
              setShowEnter(true);
            }
          }}
          onEnded={() => setShowEnter(true)}
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
