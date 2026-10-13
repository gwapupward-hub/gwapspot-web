"use client";

import { useLogin, useModalStatus, usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  canContinueAuthenticatedSession,
  resolveWalletSignInDisplay,
  WALLET_SIGN_IN_LABEL,
  type WalletSignInPhase,
} from "../lib/wallet-sign-in-phase";
import {
  getWalletAuthErrorCode,
  getWalletAuthErrorMessage,
} from "../lib/wallet-auth-error";

type WalletSignInVariant = "public" | "app";

export function WalletSignIn({
  redirectPath,
  variant = "public",
  sessionIssue = false,
}: {
  redirectPath: string;
  variant?: WalletSignInVariant;
  sessionIssue?: boolean;
}) {
  const router = useRouter();
  const { authenticated, getAccessToken, ready, user } = usePrivy();
  const { isOpen: loginModalOpen } = useModalStatus();
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [phase, setPhase] = useState<WalletSignInPhase>("idle");
  const navigationStarted = useRef(false);
  const [explicitLoginCompleted, setExplicitLoginCompleted] = useState(false);
  const isAppVariant = variant === "app";
  const display = resolveWalletSignInDisplay(phase, loginModalOpen);
  const busy = display !== "idle";

  const reportAuthEvent = useCallback(
    (event: string, code?: string | null) => {
      const payload = JSON.stringify({
        event,
        code: code ?? null,
        phase,
        host: window.location.hostname,
        userAgentClass: /iPhone|iPad|iPod/i.test(navigator.userAgent)
          ? "ios"
          : /Android/i.test(navigator.userAgent)
            ? "android"
            : "desktop",
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/auth/diagnostics",
          new Blob([payload], { type: "application/json" }),
        );
        return;
      }
      void fetch("/api/auth/diagnostics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        keepalive: true,
      });
    },
    [phase],
  );

  const hasSolanaWallet = user?.linkedAccounts.some(
    (account) => account.type === "wallet" && account.chainType === "solana",
  );

  const waitForAccessToken = useCallback(async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const token = await getAccessToken();
      if (token) return token;
      await new Promise((resolve) => window.setTimeout(resolve, 150 * (attempt + 1)));
    }
    return null;
  }, [getAccessToken]);

  const navigateWhenSessionReady = useCallback(async () => {
    if (navigationStarted.current) return;
    navigationStarted.current = true;
    setPhase("establishing_session");

    try {
      const token = await waitForAccessToken();
      if (!token) {
        reportAuthEvent("session_token_missing", "session_token_missing");
        throw new Error("Authenticated account session has no access token");
      }
      reportAuthEvent("session_ready");
      setPhase("opening");
      window.location.replace(redirectPath);
    } catch (sessionError) {
      navigationStarted.current = false;
      setPhase("idle");
      setErrorCode(getWalletAuthErrorCode(sessionError));
      setError(getWalletAuthErrorMessage(sessionError));
    }
  }, [redirectPath, reportAuthEvent, waitForAccessToken]);

  const { login } = useLogin({
    onComplete: () => {
      setExplicitLoginCompleted(true);
      reportAuthEvent("login_completed");
      setError("");
      setErrorCode(null);
      setPhase("establishing_session");
    },
    onError: (loginError) => {
      setExplicitLoginCompleted(false);
      const code = getWalletAuthErrorCode(loginError);
      reportAuthEvent("login_failed", code);
      navigationStarted.current = false;
      setPhase("idle");
      setErrorCode(code);
      setError(getWalletAuthErrorMessage(loginError));
    },
  });

  useEffect(() => {
    // A verified Privy session can continue once its Solana account context is
    // ready. Email-first users do not need to understand or select that wallet;
    // Privy provisions it in the background for features that need it later.
    if (
      !canContinueAuthenticatedSession({
        ready,
        authenticated,
        hasSolanaWallet: Boolean(hasSolanaWallet),
        sessionIssue,
        explicitLoginCompleted,
      })
    ) return;
    const navigationTimer = window.setTimeout(
      () => void navigateWhenSessionReady(),
      0,
    );
    return () => window.clearTimeout(navigationTimer);
  }, [
    authenticated,
    hasSolanaWallet,
    navigateWhenSessionReady,
    explicitLoginCompleted,
    ready,
    sessionIssue,
  ]);

  function openWalletSelector() {
    navigationStarted.current = false;
    setExplicitLoginCompleted(false);
    setPhase("idle");
    setError("");
    setErrorCode(null);
    reportAuthEvent("wallet_login_started");
    login({ loginMethods: ["wallet"] });
  }

  function goBack() {
    setError("");
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.replace("/");
  }

  function continueWithEmail() {
    navigationStarted.current = false;
    setExplicitLoginCompleted(false);
    setPhase("idle");
    setError("");
    setErrorCode(null);
    reportAuthEvent("email_login_started");
    login({ loginMethods: ["email"] });
  }

  if (!ready) {
    return (
      <section className="wallet-auth-card" aria-busy="true">
        <span className="wallet-auth-eyebrow">SECURE ACCOUNT ACCESS</span>
        <h2>Preparing your GWAP sign-in…</h2>
      </section>
    );
  }

  return (
    <section className="wallet-auth-card">
      {isAppVariant ? (
        <nav className="wallet-auth-navigation" aria-label="Sign-in navigation">
          <button type="button" onClick={goBack}>← Back</button>
          <span className="wallet-auth-app-status">GWAP OS</span>
        </nav>
      ) : (
        <nav className="wallet-auth-navigation" aria-label="Sign-in navigation">
          <button type="button" onClick={goBack}>← Back</button>
          <Link href="/" data-native-nav>GWAPSpot home</Link>
        </nav>
      )}

      {isAppVariant ? (
        <div className="wallet-auth-logo-row wallet-auth-logo-row-app" aria-hidden="true">
          <img src="/logos/gwap-agent-clear.svg" alt="" width={44} height={44} decoding="async" />
        </div>
      ) : (
        <div className="wallet-auth-logo-row" aria-hidden="true">
          <img src="/logos/gwap-agent-clear.svg" alt="" width={38} height={38} decoding="async" />
          <span />
          <img src="/logos/occo-official.svg" alt="" width={38} height={38} decoding="async" />
          <span />
          <img src="/logos/gns.webp" alt="" width={38} height={38} decoding="async" />
        </div>
      )}

      <span className="wallet-auth-eyebrow">GWAP ACCOUNT</span>
      <h2>{isAppVariant ? "Continue to your GWAP workspace." : "Sign in to GWAP OS."}</h2>
      <p>
        {isAppVariant
          ? "Start with your email. Connect a Solana wallet later only when a GWAP feature actually needs one."
          : "Use email for simple account access. A Solana wallet is optional here and can be connected when you need blockchain features."}
      </p>

      <div className="wallet-auth-actions">
        <button
          className="wallet-auth-primary"
          type="button"
          disabled={busy}
          aria-busy={busy}
          onClick={continueWithEmail}
        >
          Continue with email
        </button>
        <small className="wallet-auth-app-hint">
          One-time code. No password, crypto knowledge, or wallet setup required.
        </small>

        <div className="wallet-auth-divider">
          <span>OR</span>
        </div>

        <button
          className="wallet-auth-secondary"
          type="button"
          disabled={busy}
          aria-busy={busy}
          onClick={openWalletSelector}
        >
          {display === "idle" ? "Use a Solana wallet instead" : WALLET_SIGN_IN_LABEL[display]}
        </button>
        <small className="wallet-auth-app-hint">
          Already use Phantom, Jupiter, Solflare, Backpack, or another Solana wallet? You can connect it directly.
        </small>
      </div>

      {sessionIssue ? (
        <p className="wallet-auth-error" role="status">
          We couldn&rsquo;t finish your last sign-in automatically. Sign in again to continue.
        </p>
      ) : null}
      {authenticated && !hasSolanaWallet ? (
        <p className="wallet-auth-status" role="status">
          Finishing your secure account setup…
        </p>
      ) : null}
      {error ? (
        <div className="wallet-auth-error" role="alert">
          <p>{error}</p>
          {errorCode ? <small>Reference: {errorCode}</small> : null}
        </div>
      ) : null}
      {isAppVariant ? (
        <p className="wallet-auth-legal">
          By continuing, you agree to the{" "}
          <a href="https://www.gwapspot.com/terms">GWAPSpot Terms</a>{" "}
          and acknowledge the{" "}
          <a href="https://www.gwapspot.com/privacy">Privacy Policy</a>.
        </p>
      ) : (
        <p className="wallet-auth-legal">
          By continuing, you agree to the <Link href="/terms">GWAPSpot Terms</Link>{" "}
          and acknowledge the <Link href="/privacy">Privacy Policy</Link>.
        </p>
      )}
    </section>
  );
}
