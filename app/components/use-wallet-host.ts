"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { isGwapAppHostname } from "../lib/app-domain-routing";
import {
  resolveWalletHost,
  type InjectedProviderEvidence,
  type StandardWalletEvidence,
  type WalletHostResolution,
} from "../lib/wallet-host";

/**
 * Wallets inject asynchronously inside their own WebView, so a single
 * synchronous probe reports an ordinary browser far too often. Collect
 * evidence, then settle.
 */
const DETECTION_SETTLE_MS = 1_200;
const DETECTION_POLL_MS = 200;

export type WalletHostState = {
  /** True only on the wallet client hostname. */
  isAppHost: boolean;
  phase: "detecting" | "resolved";
  resolution: WalletHostResolution;
  /** Re-runs detection; the recovery action for a false negative. */
  retry: () => void;
};

const EMPTY_RESOLUTION: WalletHostResolution = {
  status: "browser",
  primary: null,
  candidates: [],
};

type StandardRegisterEvent = CustomEvent<
  (api: { register: (...wallets: StandardWalletEvidence[]) => () => void }) => void
>;

function collectStandardWallets(): StandardWalletEvidence[] {
  const collected: StandardWalletEvidence[] = [];
  const api = {
    register: (...wallets: StandardWalletEvidence[]) => {
      collected.push(...wallets);
      return () => undefined;
    },
  };

  // Wallet Standard handshake: wallets already present answer app-ready, and
  // wallets that register later are picked up by the listener in the effect.
  try {
    window.dispatchEvent(
      new CustomEvent("wallet-standard:app-ready", { detail: api }),
    );
  } catch {
    // A host without CustomEvent still gets the injected-provider probe below.
  }

  return collected;
}

function readProvider(
  key: string,
  value: unknown,
): InjectedProviderEvidence | null {
  if (!value || typeof value !== "object") return null;

  const provider = value as Record<string, unknown>;
  const isSolanaProvider =
    typeof provider.signMessage === "function" ||
    typeof provider.signIn === "function" ||
    typeof provider.connect === "function" ||
    Boolean(provider.isPhantom) ||
    Boolean(provider.isSolflare) ||
    Boolean(provider.isBackpack);
  if (!isSolanaProvider) return null;

  return {
    key,
    name: typeof provider.name === "string" ? provider.name : null,
    isPhantom: Boolean(provider.isPhantom),
    isJupiter: Boolean(provider.isJupiter),
    isSolflare: Boolean(provider.isSolflare),
    isBackpack: Boolean(provider.isBackpack),
    hasSignMessage:
      typeof provider.signMessage === "function" ||
      typeof provider.signIn === "function",
    hasConnect: typeof provider.connect === "function",
  };
}

function collectInjectedProviders(): InjectedProviderEvidence[] {
  const scope = window as unknown as Record<string, Record<string, unknown>>;
  const sources: [string, unknown][] = [
    ["phantom.solana", scope.phantom?.solana],
    ["solana", scope.solana],
    ["solflare", scope.solflare],
    ["backpack", scope.backpack],
    ["jupiter", scope.jupiter ?? scope.Jupiter],
  ];

  return sources
    .map(([key, value]) => readProvider(key, value))
    .filter((provider): provider is InjectedProviderEvidence => provider !== null);
}

const subscribeToAppHost = () => () => undefined;

function readIsAppHost() {
  return (
    document.documentElement.dataset.gwapAppHost === "true" ||
    isGwapAppHostname(window.location.hostname)
  );
}

export function useWalletHost(): WalletHostState {
  // Matches the app-host read in `public-experience-layers`: the hostname is
  // an external, never-changing fact, so it is read rather than stored.
  const isAppHost = useSyncExternalStore(
    subscribeToAppHost,
    readIsAppHost,
    () => false,
  );
  const [phase, setPhase] = useState<"detecting" | "resolved">("detecting");
  const [resolution, setResolution] = useState<WalletHostResolution>(EMPTY_RESOLUTION);
  const [attempt, setAttempt] = useState(0);
  const lateWallets = useRef<StandardWalletEvidence[]>([]);

  const retry = useCallback(() => {
    setPhase("detecting");
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let settled = false;
    let pollTimer = 0;
    const started = Date.now();

    const probe = () => {
      if (cancelled) return;

      const next = resolveWalletHost({
        standardWallets: [...collectStandardWallets(), ...lateWallets.current],
        injectedProviders: collectInjectedProviders(),
        userAgent: window.navigator.userAgent,
      });

      const foundWallet = next.status === "wallet";
      // Settle early on a positive result; otherwise keep probing for a wallet
      // that injects late before declaring this an ordinary browser.
      if (!settled && !foundWallet && Date.now() - started < DETECTION_SETTLE_MS) {
        return;
      }

      // Once a wallet host is established it does not un-establish: a later
      // probe may only upgrade an ordinary browser, never revoke a wallet.
      if (settled && !foundWallet) return;

      settled = true;
      window.clearInterval(pollTimer);
      setResolution(next);
      setPhase("resolved");
    };

    const onLateRegistration = (event: Event) => {
      const detail = (event as StandardRegisterEvent).detail;
      if (typeof detail !== "function") return;
      detail({
        register: (...wallets: StandardWalletEvidence[]) => {
          lateWallets.current.push(...wallets);
          return () => undefined;
        },
      });
      probe();
    };

    // A backgrounded wallet WebView can finish injecting while hidden.
    const onForeground = () => {
      if (document.visibilityState === "visible") probe();
    };

    window.addEventListener("wallet-standard:register-wallet", onLateRegistration);
    document.addEventListener("visibilitychange", onForeground);
    window.addEventListener("focus", onForeground);

    pollTimer = window.setInterval(probe, DETECTION_POLL_MS);
    probe();

    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
      window.removeEventListener(
        "wallet-standard:register-wallet",
        onLateRegistration,
      );
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("focus", onForeground);
    };
  }, [attempt]);

  return useMemo(
    () => ({ isAppHost, phase, resolution, retry }),
    [isAppHost, phase, resolution, retry],
  );
}
