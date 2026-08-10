"use client";

import { useEffect, useState } from "react";

type BootPhase = "idle" | "booting" | "online" | "done";

const bootModules = ["GNS", "GWAPSCORE", "DIMI", "ISNAD"] as const;

export function GwapBootSequence() {
  const [phase, setPhase] = useState<BootPhase>("idle");

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) return;

    const overview = document.getElementById("overview");
    if (!overview) return;

    let hasRun = false;
    let onlineTimer = 0;
    let doneTimer = 0;

    const triggerBoot = () => {
      if (hasRun || window.scrollY < 24) return;

      const rect = overview.getBoundingClientRect();
      const enteringSystem =
        rect.top <= window.innerHeight * 0.78 && rect.bottom > 0;

      if (!enteringSystem) return;

      hasRun = true;
      setPhase("booting");
      onlineTimer = window.setTimeout(() => setPhase("online"), 520);
      doneTimer = window.setTimeout(() => setPhase("done"), 1080);
    };

    triggerBoot();
    window.addEventListener("scroll", triggerBoot, { passive: true });

    return () => {
      window.removeEventListener("scroll", triggerBoot);
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
            <div key={module} style={{ "--gwap-boot-index": index } as React.CSSProperties}>
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
