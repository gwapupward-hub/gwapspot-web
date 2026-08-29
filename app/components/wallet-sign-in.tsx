"use client";

import {
  useConnectWallet,
  useLoginWithSiws,
  usePrivy,
} from "@privy-io/react-auth";
import { useWallets as usePrivySolanaWallets } from "@privy-io/react-auth/solana";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getWalletAuthErrorMessage } from "../lib/wallet-auth-error";

type WalletSignInVariant = "public" | "app";

function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
}

export function WalletSignIn({
  redirectPath,
  variant = "public",
}: {
  redirectPath: string;
  variant?: WalletSignInVariant;
}) {
  const router = useRouter();
  const { authenticated, getAccessToken, login, ready, user } = usePrivy();
  const { generateSiwsMessage, loginWithSiws } = useLoginWithSiws();
  const {
    ready: solanaWalletsReady,
    wallets: solanaWallets,
  } = usePrivySolanaWallets();
  const [error, setError] = useState("");
  const [signing, setSigning] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const navigationStarted = useRef(false);
  const activeWallet = solanaWallets[0];
  const connectedAddress = activeWallet?.address;
  const isAppVariant = variant === "app";

  const { connectWallet } = useConnectWallet({
    onSuccess: () => setError(""),
    onError: (connectError) => {
      setError(getWalletAuthErrorMessage(connectError));
    },
  });

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

  useEffect(() => {
    if (!ready || !authenticated || !hasSolanaWallet) return;
    const navigationTimer = window.setTimeout(
      () => void navigateWhenSessionReady(),
      0,
    );
    return () => window.clearTimeout(navigationTimer);
  }, [authenticated, hasSolanaWallet, navigateWhenSessionReady, ready]);

  async function signInWithWallet() {
    if (!activeWallet) {
      setError("Choose a Solana wallet to continue.");
      return;
    }

    setSigning(true);
    setError("");

    try {
      const message = await generateSiwsMessage({ address: activeWallet.address });
      const { signature } = await activeWallet.signMessage({
        message: new TextEncoder().encode(message),
      });

      await loginWithSiws({
        message,
        signature: encodeBase64(signature),
      });
      setRedirecting(true);
      await navigateWhenSessionReady();
    } catch (loginError) {
      setError(getWalletAuthErrorMessage(loginError));
    } finally {
      setSigning(false);
    }
  }

  function openWalletSelector() {
    setError("");
    connectWallet();
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

  if (!ready || !solanaWalletsReady) {
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
        {!activeWallet ? (
          <button
            className="wallet-auth-primary"
            type="button"
            onClick={openWalletSelector}
          >
            Connect Solana wallet
          </button>
        ) : (
          <>
            <div className="wallet-auth-connected">
              <span>{activeWallet.standardWallet.name || "Solana wallet"}</span>
              <strong>
                {connectedAddress?.slice(0, 5)}…{connectedAddress?.slice(-5)}
              </strong>
              <button type="button" onClick={openWalletSelector}>
                Change
              </button>
            </div>
            <button
              className="wallet-auth-primary"
              type="button"
              disabled={signing || redirecting}
              onClick={() => void signInWithWallet()}
            >
              {redirecting
                ? "Opening GWAP OS…"
                : signing
                  ? "Waiting for signature…"
                  : "Sign message and continue"}
            </button>
          </>
        )}

        <div className="wallet-auth-divider">
          <span>{isAppVariant ? "NEW TO GWAP?" : "NO WALLET YET?"}</span>
        </div>
        <button
          className="wallet-auth-secondary"
          type="button"
          onClick={createWalletWithEmail}
        >
          Create a Solana wallet with email
        </button>
        <small>
          Use your existing email address. A self-custodial embedded Solana wallet
          is created for this account—no password or browser extension required.
        </small>
      </div>

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
