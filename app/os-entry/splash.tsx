"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./splash.module.css";

const VIDEO_URL =
  "https://res.cloudinary.com/dg1u1wpdu/video/upload/q_auto:good/v1788007506/gwap-os-app-splash.mp4";
const POSTER_URL =
  "https://res.cloudinary.com/dg1u1wpdu/video/upload/so_10.0,q_auto:good,f_jpg/v1788007506/gwap-os-app-splash.jpg";

export function GwapOsSplash() {
  const [showEnter, setShowEnter] = useState(false);
  const [playbackFailed, setPlaybackFailed] = useState(false);

  return (
    <main className={styles.shell} aria-label="GWAP OS entrance">
      <div
        className={styles.poster}
        style={{ backgroundImage: `url(${POSTER_URL})` }}
        aria-hidden="true"
      />

      {!playbackFailed ? (
        <video
          className={styles.video}
          src={VIDEO_URL}
          poster={POSTER_URL}
          autoPlay
          muted
          playsInline
          preload="auto"
          onTimeUpdate={(event) => {
            const video = event.currentTarget;
            if (video.duration && video.duration - video.currentTime <= 1.15) {
              setShowEnter(true);
            }
          }}
          onEnded={() => setShowEnter(true)}
          onError={() => {
            setPlaybackFailed(true);
            setShowEnter(true);
          }}
        />
      ) : null}

      <div className={styles.vignette} aria-hidden="true" />

      <div
        className={`${styles.entryWrap} ${showEnter ? styles.entryVisible : ""}`}
      >
        <Link href="/app" className={styles.enterButton} prefetch>
          Enter Tha GwapSpot
        </Link>
      </div>
    </main>
  );
}
