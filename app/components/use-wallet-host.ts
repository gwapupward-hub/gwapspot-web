"use client";

import { useEffect, useRef, useState } from "react";
import {
  classifyWalletHost,
  readWalletHostEnvironment,
  type WalletHostDetection,
} from "../lib/wallet-host-detection";

// How long to keep polling for a provider that is injected asynchronously
// (many mobile wallet WebViews inject `window.solana` a few hundred ms after
// first paint) before concluding the browser is unsupported.
const INJECTION_GRACE_MS = 2_400;
const POLL_INTERVAL_MS = 200;

const DETECTING: WalletHostDetection = {
  status: "detecting",
  provider: null,
  canSignMessage: false,
};

// Observe the current wallet host with capability-based detection. Starts in a
// `detecting` state, resolves to `ready` as soon as a signing-capable provider
// appears, and settles on `missing`/`unsupported` only after a grace period so
// delayed provider injection cannot be misread as an ordinary browser. Re-checks
// on foreground transitions so a wallet that finishes initializing after the
// tab is backgrounded is still recognized.
export function useWalletHost(): WalletHostDetection {
  const [detection, setDetection] = useState<WalletHostDetection>(DETECTING);
  const settledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    let pollTimer: number | null = null;

    const evaluate = () => {
      if (cancelled) return;
      const next = classifyWalletHost(readWalletHostEnvironment());

      if (next.status === "ready") {
        settledRef.current = true;
        setDetection(next);
        return;
      }

      // Keep waiting for delayed injection until the grace window elapses.
      if (Date.now() - startedAt < INJECTION_GRACE_MS) {
        setDetection((current) =>
          current.status === "detecting" ? current : DETECTING,
        );
        pollTimer = window.setTimeout(evaluate, POLL_INTERVAL_MS);
        return;
      }

      settledRef.current = true;
      setDetection(next);
    };

    evaluate();

    // A wallet that registers via Wallet Standard emits this event; re-evaluate
    // immediately rather than waiting for the next poll tick.
    const onRegister = () => evaluate();
    window.addEventListener("wallet-standard:register-wallet", onRegister);

    // Foreground/resume transitions in wallet WebViews can complete provider
    // injection that was paused while backgrounded. Re-check even after we have
    // settled, so a late-ready provider upgrades the state.
    const onResume = () => {
      const current = classifyWalletHost(readWalletHostEnvironment());
      if (current.status === "ready") {
        settledRef.current = true;
        setDetection(current);
      } else if (!settledRef.current) {
        evaluate();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") onResume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onResume);
    window.addEventListener("focus", onResume);

    return () => {
      cancelled = true;
      if (pollTimer !== null) window.clearTimeout(pollTimer);
      window.removeEventListener("wallet-standard:register-wallet", onRegister);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onResume);
      window.removeEventListener("focus", onResume);
    };
  }, []);

  return detection;
}
