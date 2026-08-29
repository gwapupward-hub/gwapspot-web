"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef } from "react";
import { walletSessionAction } from "../lib/wallet-session";
import { GWAP_OS_STORAGE_KEY } from "../lib/os-state";

type AccountChangeEmitter = {
  on?: (event: string, handler: (payload: unknown) => void) => void;
  off?: (event: string, handler: (payload: unknown) => void) => void;
  removeListener?: (event: string, handler: (payload: unknown) => void) => void;
};

function readAddress(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === "string") return payload;

  const candidate = payload as { toBase58?: () => string; publicKey?: unknown };
  if (typeof candidate.toBase58 === "function") return candidate.toBase58();
  if (candidate.publicKey) return readAddress(candidate.publicKey);
  return null;
}

function accountChangeEmitters(): AccountChangeEmitter[] {
  const scope = window as unknown as Record<string, Record<string, unknown>>;
  return [
    scope.phantom?.solana,
    scope.solana,
    scope.solflare,
    scope.backpack,
  ].filter((provider): provider is AccountChangeEmitter =>
    Boolean(provider && typeof (provider as AccountChangeEmitter).on === "function"),
  );
}

/**
 * Ends the GWAP OS session when the host wallet switches to a different
 * account. Signing out and returning to the wallet gateway is the only correct
 * outcome: the session was issued to the wallet that proved ownership, and a
 * new account has proved nothing yet.
 */
export function WalletSessionGuard({ sessionWallet }: { sessionWallet: string }) {
  const { logout } = usePrivy();
  const handled = useRef(false);

  useEffect(() => {
    const emitters = accountChangeEmitters();
    if (emitters.length === 0) return;

    const onAccountChanged = (payload: unknown) => {
      if (handled.current) return;

      const hostWallet = readAddress(payload);
      if (walletSessionAction({ sessionWallet, hostWallet }) !== "reauthenticate") {
        return;
      }

      handled.current = true;
      void (async () => {
        try {
          await logout();
        } finally {
          try {
            window.localStorage.removeItem(GWAP_OS_STORAGE_KEY);
          } catch {
            // A WebView with storage disabled still gets a clean redirect.
          }
          window.location.replace("/os-sign-in?redirect_url=/app");
        }
      })();
    };

    for (const emitter of emitters) {
      emitter.on?.("accountChanged", onAccountChanged);
    }

    return () => {
      for (const emitter of emitters) {
        const remove = emitter.off ?? emitter.removeListener;
        remove?.call(emitter, "accountChanged", onAccountChanged);
      }
    };
  }, [logout, sessionWallet]);

  return null;
}
