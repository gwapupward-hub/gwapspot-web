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

type WalletStandardWalletLike = {
  features?: Record<string, unknown>;
};

type WalletStandardRegisterApi = {
  register: (...wallets: unknown[]) => () => void;
};

function countStandardSigningWallets(wallets: Iterable<unknown>): number {
  let count = 0;
  for (const wallet of wallets) {
    if (!wallet || typeof wallet !== "object") continue;
    const features = (wallet as WalletStandardWalletLike).features;
    if (!features) continue;
    if ("solana:signMessage" in features || "solana:signIn" in features) {
      count += 1;
    }
  }
  return count;
}

// Observe the current wallet host with capability-based detection. Starts in a
// `detecting` state, resolves to `ready` as soon as a signing-capable provider
// appears, and settles on `missing`/`unsupported` only after a grace period so
// delayed provider injection cannot be misread as an ordinary browser. Re-checks
// on foreground transitions so a wallet that finishes initializing after the
// tab is backgrounded is still recognized.
//
// Modern Wallet Standard wallets are discovered through the global
// `wallet-standard:register-wallet` / `wallet-standard:app-ready` handshake.
// Do not rely on `navigator.wallets.get()` for the primary path: that API belongs
// to the deprecated registration bridge and is not how current Standard wallets
// are guaranteed to register.
export function useWalletHost(): WalletHostDetection {
  const [detection, setDetection] = useState<WalletHostDetection>(DETECTING);
  const settledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    let pollTimer: number | null = null;
    const standardWallets = new Set<unknown>();

    const evaluate = () => {
      if (cancelled) return;
      const environment = readWalletHostEnvironment();
      environment.standardSignerCount = Math.max(
        environment.standardSignerCount ?? 0,
        countStandardSigningWallets(standardWallets),
      );
      const next = classifyWalletHost(environment);

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

    const standardApi: WalletStandardRegisterApi = Object.freeze({
      register: (...wallets: unknown[]) => {
        for (const wallet of wallets) standardWallets.add(wallet);
        evaluate();
        return () => {
          for (const wallet of wallets) standardWallets.delete(wallet);
          evaluate();
        };
      },
    });

    evaluate();

    // Current Wallet Standard wallets register by dispatching this event with a
    // callback in `detail`. Calling it with our registration API captures the
    // wallet and lets capability detection observe its advertised features.
    const onRegister = (event: Event) => {
      const callback = (event as CustomEvent<unknown>).detail;
      if (typeof callback === "function") {
        try {
          (callback as (api: WalletStandardRegisterApi) => void)(standardApi);
        } catch {
          // A malformed third-party wallet registration must not break the gate.
        }
      }
      evaluate();
    };
    window.addEventListener("wallet-standard:register-wallet", onRegister);

    // Wallets that loaded before this hook listen for app-ready and register
    // synchronously when it is dispatched. This closes the race where the
    // original register-wallet event happened before our listener existed.
    try {
      window.dispatchEvent(
        new CustomEvent("wallet-standard:app-ready", { detail: standardApi }),
      );
    } catch {
      // Legacy/non-standard WebViews still have the injected-provider path.
    }

    // Foreground/resume transitions in wallet WebViews can complete provider
    // injection that was paused while backgrounded. Re-check even after we have
    // settled, so a late-ready provider upgrades the state.
    const onResume = () => {
      const environment = readWalletHostEnvironment();
      environment.standardSignerCount = Math.max(
        environment.standardSignerCount ?? 0,
        countStandardSigningWallets(standardWallets),
      );
      const current = classifyWalletHost(environment);
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
