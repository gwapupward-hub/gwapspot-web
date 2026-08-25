"use client";

import { useEffect, useState, type CSSProperties } from "react";

type BootPhase = "idle" | "booting" | "online" | "done";

const BOOT_SEEN_KEY = "gwap-system-boot-seen-v1";
const bootModules = ["GNS", "GWAPSCORE", "DIMI", "DAILY IDEAS"] as const;

function hasBootedThisSession() {
  try {
    return window.sessionStorage.getItem(BOOT_SEEN_KEY) === "true";
  } catch {
    return false;
  }
}

function markBootSeen() {
  try {
    window.sessionStorage.setItem(BOOT_SEEN_KEY, "true");
  } catch {
    // Storage can be unavailable in privacy-restricted browsing contexts.
  }
}

export function GwapBootSequence() {
  const [phase, setPhase] = useState<BootPhase>("idle");

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches || hasBootedThisSession()) return;

    const overview = document.getElementById("overview");
    if (!overview) return;

    let hasRun = false;
    let onlineTimer = 0;
    let doneTimer = 0;
    let observer: IntersectionObserver | null = null;

    const triggerBoot = () => {
      if (hasRun) return;
      hasRun = true;
      observer?.disconnect();
      markBootSeen();
      setPhase("booting");
      onlineTimer = window.setTimeout(() => setPhase("online"), 520);
      doneTimer = window.setTimeout(() => setPhase("done"), 1080);
    };

    observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) triggerBoot();
      },
      { rootMargin: "0px 0px -22% 0px", threshold: 0.01 },
    );
    observer.observe(overview);

    return () => {
      observer?.disconnect();
      window.clearTimeout(onlineTimer);
      window.clearTimeout(doneTimer);
    };
  }, []);

  if (phase === "idle" || phase === "done") return null;

  return (
    <div className={`gwap-boot-sequence is-${phase}`} aria-hidden="true">
      <div className="gwap-boot-grid" />
      <div className="gwap-boot-panel">
        <div className="gwap-boot-heading">
          <span>GWAP CORE // ENTRY</span>
          <strong>System initialization</strong>
        </div>
        <div className="gwap-boot-modules">
          {bootModules.map((module, index) => (
            <div key={module} style={{ "--gwap-boot-index": index } as CSSProperties}>
              <span>{module}</span>
              <i />
              <b>{phase === "online" ? "ONLINE" : "SYNC"}</b>
            </div>
          ))}
        </div>
        <footer>
          <span>CONNECTED INFRASTRUCTURE</span>
          <b>{phase === "online" ? "CORE STATUS // ONLINE" : "ESTABLISHING SIGNAL"}</b>
        </footer>
      </div>
    </div>
  );
}
