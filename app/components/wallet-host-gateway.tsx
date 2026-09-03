"use client";

import { useCallback, useMemo } from "react";
import type {
  WalletHostStatus,
  WalletProviderName,
} from "../lib/wallet-host-detection";

// Build a Phantom universal link that reopens the current URL inside Phantom's
// in-app browser. Safe to call only in the browser.
function buildPhantomDeepLink(currentUrl: string): string {
  const encoded = encodeURIComponent(currentUrl);
  const ref = encodeURIComponent(new URL(currentUrl).origin);
  return `https://phantom.app/ul/browse/${encoded}?ref=${ref}`;
}

// Terminal gateway shown to ordinary browsers on app.gwapspot.com. The full
// GwapOS client stays unavailable outside supported wallet hosts; this surface
// only offers ways to reopen inside a wallet browser and to re-check detection.
export function WalletHostGateway({
  status,
  provider,
}: {
  status: Extract<WalletHostStatus, "missing" | "unsupported">;
  provider: WalletProviderName | null;
}) {
  const phantomLink = useMemo(() => {
    if (typeof window === "undefined") return "https://phantom.app/download";
    try {
      return buildPhantomDeepLink(window.location.href);
    } catch {
      return "https://phantom.app/download";
    }
  }, []);

  const recheck = useCallback(() => {
    if (typeof window !== "undefined") window.location.reload();
  }, []);

  const headline =
    status === "unsupported"
      ? "This wallet can’t sign in yet."
      : "Open GWAP OS in your wallet.";

  const description =
    status === "unsupported"
      ? `The ${provider && provider !== "unknown" ? provider : "connected"} provider in this browser can’t approve a Solana sign-in message. Open GWAP OS inside a supported Solana wallet browser to continue.`
      : "GWAP OS is a wallet-native application. Open it inside a supported Solana wallet browser—Phantom or Jupiter—to authenticate with your wallet.";

  return (
    <section className="wallet-auth-card" aria-live="polite">
      <span className="wallet-auth-eyebrow">GWAP OS / WALLET REQUIRED</span>
      <h2>{headline}</h2>
      <p>{description}</p>

      <div className="wallet-auth-actions">
        <a
          className="wallet-auth-primary"
          href={phantomLink}
          rel="noopener noreferrer"
          data-native-nav
        >
          Open in Phantom
        </a>
        <a
          className="wallet-auth-secondary"
          href="https://jup.ag/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Get Jupiter Wallet
        </a>
        <small>
          Already using a wallet browser? It may still be loading.{" "}
          <button
            type="button"
            className="wallet-auth-inline-link"
            onClick={recheck}
          >
            Re-check for your wallet
          </button>
          .
        </small>
      </div>

      <p className="wallet-auth-legal">
        By continuing, you agree to the{" "}
        <a href="https://www.gwapspot.com/terms">GWAPSpot Terms</a> and
        acknowledge the{" "}
        <a href="https://www.gwapspot.com/privacy">Privacy Policy</a>.
      </p>
    </section>
  );
}
