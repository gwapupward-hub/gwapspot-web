"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { GnsIdentity } from "../lib/os-state";

const BOOT_KEY = "gwap-os-booted-v2";

export function BootSequence({
  enabled,
  gnsIdentity,
  reduceMotion,
}: {
  enabled: boolean;
  gnsIdentity: GnsIdentity;
  reduceMotion: boolean;
}) {
  const [mode, setMode] = useState<"full" | "flash" | null>(null);

  const lines = useMemo(() => {
    const identityLine =
      gnsIdentity.status === "found"
        ? `identity found: ${gnsIdentity.fullName ?? gnsIdentity.name ?? "verified wallet"}`
        : gnsIdentity.status === "none"
          ? "identity not found: initialization available"
          : "registry timeout: limited mode enabled";
    const scoreLine =
      gnsIdentity.score === null
        ? "GwapScore: awaiting signal"
        : `GwapScore: ${gnsIdentity.score}${gnsIdentity.scoreTier ? ` / ${gnsIdentity.scoreTier}` : ""}`;

    return [
      "mounting gwap://workspace...",
      "checking GNS registry...",
      identityLine,
      scoreLine,
      "system ready.",
    ];
  }, [gnsIdentity]);

  useEffect(() => {
    if (!enabled || reduceMotion) return;

    let seen = false;
    try {
      seen = window.localStorage.getItem(BOOT_KEY) === "true";
      window.localStorage.setItem(BOOT_KEY, "true");
    } catch {
      // Storage restrictions should never block entry into the OS.
    }

    setMode(seen ? "flash" : "full");
    const timer = window.setTimeout(() => setMode(null), seen ? 760 : 2500);
    return () => window.clearTimeout(timer);
  }, [enabled, reduceMotion]);

  if (!mode) return null;

  return (
    <div className={`os-boot os-boot-${mode}`} role="status" aria-live="polite">
      <div className="os-boot-terminal">
        <div className="os-boot-brand">GWAP OS // SECURE RUNTIME</div>
        <div className="os-boot-lines">
          {(mode === "flash" ? lines.slice(-2) : lines).map((line, index) => (
            <p key={line} style={{ "--boot-index": index } as CSSProperties}>
              <span aria-hidden="true">›</span> {line}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
