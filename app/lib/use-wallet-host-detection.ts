"use client";

import { getWallets } from "@wallet-standard/app";
import { useEffect, useState } from "react";
import {
  classifyRegisteredWallets,
  type WalletClassification,
} from "./wallet-host-detection";

// How long to wait for a wallet to register before treating the host as
// "missing" or "unsupported" rather than "detecting". This only bounds how
// long the loading state shows - it does not stop listening. getWallets()'s
// "register" event stays subscribed for the life of the page, so a wallet
// that injects after this window still upgrades the state once it arrives.
const DETECTION_GRACE_MS = 1_200;

export type WalletHostDetectionState =
  | { status: "detecting" }
  | WalletClassification;

export function useWalletHostDetection(): WalletHostDetectionState {
  const [state, setState] = useState<WalletHostDetectionState>({
    status: "detecting",
  });

  useEffect(() => {
    // "ready" is the only terminal outcome. "missing" and "unsupported" are
    // provisional - both must keep listening, since a wallet that hasn't
    // registered yet (or a better one alongside an unsupported one) can
    // still show up and upgrade the state.
    let ready = false;
    const wallets = getWallets();

    const evaluate = () => {
      if (ready) return;
      const classification = classifyRegisteredWallets(wallets.get());
      setState(classification);
      if (classification.status === "ready") ready = true;
    };

    // Catches wallets already registered by the time this effect runs, and
    // (via the listener) any that register later - injection timing varies
    // across wallet WebViews, so both orderings must be handled the same
    // way.
    evaluate();
    const unsubscribe = wallets.on("register", evaluate);
    const graceTimer = window.setTimeout(evaluate, DETECTION_GRACE_MS);

    // Some wallet WebViews finish wiring up their provider only once the
    // page is foregrounded again. Re-check on that transition rather than
    // relying solely on a timer, which mobile OSes can throttle while
    // backgrounded.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") evaluate();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      ready = true;
      window.clearTimeout(graceTimer);
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return state;
}
