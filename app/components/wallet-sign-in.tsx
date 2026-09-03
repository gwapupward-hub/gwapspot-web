"use client";

import { useLogin, usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getWalletAuthErrorMessage } from "../lib/wallet-auth-error";

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
  const [error, setError] = useState("");
  const [redirecting, setRedirecting] = useState(false);
  const navigationStarted = useRef(false);
  const isAppVariant = variant === "app";

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

    try {
      const token = await waitForAccessToken();
      if (!token) {
        throw new Error("Authenticated wallet session has no access token");
      }
      setRedirecting(true);
      window.location.replace(redirectPath);
    } catch (sessionError) {
      navigationStarted.current = false;
      setRedirecting(false);
      setError(getWalletAuthErrorMessage(sessionError));
    }
  }, [redirectPath, waitForAccessToken]);

  const { login } = useLogin({
    onComplete: () => {
      void navigateWhenSessionReady();
    },
    onError: (loginError) => {
      navigationStarted.current = false;
      setRedirecting(false);
      setError(getWalletAuthErrorMessage({ code: loginError }));
    },
  });

  useEffect(() => {
    // sessionIssue means the last automatic attempt to reach /app kept
    // bouncing back here without ever landing. The wallet client may still
    // believe it is authenticated - that stale belief is exactly what drove
    // the bounce - so silently retrying the same path here would resume the
    // loop instead of breaking it. Require the explicit "Connect Solana
    // wallet" tap, which forces a fresh login rather than reusing state that
    // was already shown not to work.
    if (!ready || !authenticated || !hasSolanaWallet || sessionIssue) return;
    const navigationTimer = window.setTimeout(
      () => void navigateWhenSessionReady(),
      0,
    );
    return () => window.clearTimeout(navigationTimer);
  }, [authenticated, hasSolanaWallet, navigateWhenSessionReady, ready, sessionIssue]);

  function openWalletSelector() {
    setError("");
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

  function createWalletWithEmail() {
    setError("");
    login({ loginMethods: ["email"] });
  }

  if (!ready) {
    return (
      <section className="wallet-auth-card" aria-busy="true">
        <span className="wallet-auth-eyebrow">
          {isAppVariant ? "GWAP OS / SECURE ACCESS" : "SECURE WALLET SESSION"}
        </span>
        <h2>Preparing wallet access…</h2>
      </section>
    );
  }

  return (
    <section className="wallet-auth-card">
      {isAppVariant ? (
        <nav className="wallet-auth-navigation" aria-label="Sign-in navigation">
          <button type="button" onClick={goBack}>← Back to splash</button>
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

      <span className="wallet-auth-eyebrow">
        {isAppVariant ? "SOLANA IDENTITY" : "SOLANA WALLET AUTHENTICATION"}
      </span>
      <h2>
        {isAppVariant ? "Authenticate with your wallet." : "Your wallet is your GWAP sign-in."}
      </h2>
      <p>
        {isAppVariant
          ? "Connect your Solana wallet, then approve one ownership message to enter GWAP OS. No transaction. No SOL fee."
          : "Connect a Solana wallet, then approve one message to prove ownership. This does not submit a transaction or cost SOL."}
      </p>

      <div className="wallet-auth-actions">
        <button
          className="wallet-auth-primary"
          type="button"
          disabled={redirecting}
          onClick={openWalletSelector}
        >
          {redirecting ? "Opening GWAP OS…" : "Connect Solana wallet"}
        </button>

        <div className="wallet-auth-divider">
          <span>{isAppVariant ? "NEW TO GWAP?" : "NO WALLET YET?"}</span>
        </div>
        <button
          className="wallet-auth-secondary"
          type="button"
          disabled={redirecting}
          onClick={createWalletWithEmail}
        >
          Create a Solana wallet with email
        </button>
        <small>
          Use your existing email address. A self-custodial embedded Solana wallet
          is created for this account—no password or browser extension required.
        </small>
      </div>

      {sessionIssue ? (
        <p className="wallet-auth-error" role="status">
          We couldn&rsquo;t finish your last sign-in automatically. Reconnect
          your wallet to continue.
        </p>
      ) : null}
      {authenticated && !hasSolanaWallet ? (
        <p className="wallet-auth-status" role="status">
          Finishing your Solana wallet setup…
        </p>
      ) : null}
      {error ? (
        <p className="wallet-auth-error" role="alert">
          {error}
        </p>
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
