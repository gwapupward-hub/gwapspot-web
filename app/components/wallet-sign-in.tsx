"use client";

import { useLoginWithSiws, usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getWalletAuthErrorMessage } from "../lib/wallet-auth-error";

function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
}

export function WalletSignIn({ redirectPath }: { redirectPath: string }) {
  const router = useRouter();
  const { authenticated, login, ready, user } = usePrivy();
  const { generateSiwsMessage, loginWithSiws } = useLoginWithSiws();
  const { connected, publicKey, signMessage, wallet } = useWallet();
  const { setVisible } = useWalletModal();
  const [error, setError] = useState("");
  const [signing, setSigning] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const connectedAddress = publicKey?.toBase58();

  const hasSolanaWallet = user?.linkedAccounts.some(
    (account) => account.type === "wallet" && account.chainType === "solana",
  );

  useEffect(() => {
    if (!ready || !authenticated || !hasSolanaWallet) return;
    window.location.replace(redirectPath);
  }, [authenticated, hasSolanaWallet, ready, redirectPath]);

  async function signInWithWallet() {
    if (!publicKey || !signMessage) {
      setError("Choose a wallet that supports message signing to continue.");
      return;
    }

    setSigning(true);
    setError("");

    try {
      const address = publicKey.toBase58();
      const message = await generateSiwsMessage({ address });
      const signature = await signMessage(new TextEncoder().encode(message));

      await loginWithSiws({
        message,
        signature: encodeBase64(signature),
      });
      setRedirecting(true);
      window.location.replace(redirectPath);
    } catch (loginError) {
      setError(getWalletAuthErrorMessage(loginError));
    } finally {
      setSigning(false);
    }
  }

  function goBack() {
    setError("");
    if (window.history.length > 1) {
      router.back();
      return;
    }
    window.location.assign("/");
  }

  function createWalletWithEmail() {
    setError("");
    login({ loginMethods: ["email"] });
  }

  if (!ready) {
    return (
      <section className="wallet-auth-card" aria-busy="true">
        <span className="wallet-auth-eyebrow">SECURE WALLET SESSION</span>
        <h2>Preparing wallet access…</h2>
      </section>
    );
  }

  return (
    <section className="wallet-auth-card">
      <nav className="wallet-auth-navigation" aria-label="Sign-in navigation">
        <button type="button" onClick={goBack}>← Back</button>
        <a href="/" data-native-nav>GWAPSpot home</a>
      </nav>
      <div className="wallet-auth-logo-row" aria-hidden="true">
        <img src="/logos/gwap-agent-clear.svg" alt="" width={38} height={38} decoding="async" />
        <span />
        <img src="/logos/occo-official.svg" alt="" width={38} height={38} decoding="async" />
        <span />
        <img src="/logos/gns.webp" alt="" width={38} height={38} decoding="async" />
      </div>
      <span className="wallet-auth-eyebrow">SOLANA WALLET AUTHENTICATION</span>
      <h2>Your wallet is your GWAP sign-in.</h2>
      <p>
        Connect a Solana wallet, then approve one message to prove ownership.
        This does not submit a transaction or cost SOL.
      </p>

      <div className="wallet-auth-actions">
        {!connected ? (
          <button
            className="wallet-auth-primary"
            type="button"
            onClick={() => setVisible(true)}
          >
            Connect Solana wallet
          </button>
        ) : (
          <>
            <div className="wallet-auth-connected">
              <span>{wallet?.adapter.name ?? "Solana wallet"}</span>
              <strong>
                {connectedAddress?.slice(0, 5)}…{connectedAddress?.slice(-5)}
              </strong>
              <button type="button" onClick={() => setVisible(true)}>
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
          <span>NO WALLET YET?</span>
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
      <p className="wallet-auth-legal">
        By continuing, you agree to the <Link href="/terms">GWAPSpot Terms</Link>{" "}
        and acknowledge the <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </section>
  );
}
