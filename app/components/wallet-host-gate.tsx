"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { GWAP_APP_HOSTNAME } from "../lib/app-domain-routing";
import type { WalletHostResolution } from "../lib/wallet-host";
import { useWalletHost } from "./use-wallet-host";
import styles from "./wallet-host-gate.module.css";

const NO_WALLET_HOST: WalletHostResolution = {
  status: "browser",
  primary: null,
  candidates: [],
};

const WalletHostContext = createContext<WalletHostResolution>(NO_WALLET_HOST);

/**
 * The wallet host resolved by the gate. Anything rendered inside the gate can
 * read it without repeating detection, so there is exactly one detector.
 */
export function useResolvedWalletHost() {
  return useContext(WalletHostContext);
}

const SUPPORTED_WALLETS = ["Phantom", "Jupiter", "Solflare", "Backpack"];
const PUBLIC_SITE_URL = "https://www.gwapspot.com";
const APP_URL = `https://${GWAP_APP_HOSTNAME}`;

/**
 * The ordinary-browser gateway for app.gwapspot.com.
 *
 * The wallet client is not shown outside a wallet, and the public website is
 * not shown in its place: this is a deliberate, restrained hand-off.
 */
export function WalletHostRequired({ onRetry }: { onRetry: () => void }) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [copyState, setCopyState] = useState("");

  async function copyAppLink() {
    try {
      await navigator.clipboard.writeText(APP_URL);
      setCopyState("Link copied. Paste it into your wallet browser.");
    } catch {
      setCopyState(`Copy this address into your wallet browser: ${APP_URL}`);
    }
  }

  return (
    <main className={styles.gate} aria-labelledby="wallet-host-required-title">
      <div className={styles.panel}>
        <img
          className={styles.mark}
          src="/logos/gwap-agent-clear.svg"
          alt=""
          width={54}
          height={54}
          decoding="async"
        />
        <span className={styles.kicker}>GWAP OS</span>
        <h1 className={styles.title} id="wallet-host-required-title">
          Open GWAP OS from your Solana wallet.
        </h1>
        <p className={styles.body}>
          For the full wallet-native experience, open{" "}
          <code>{GWAP_APP_HOSTNAME}</code> inside Phantom, Jupiter, Solflare, or
          another supported Solana wallet.
        </p>

        <div className={styles.wallets} aria-label="Supported wallet browsers">
          {SUPPORTED_WALLETS.map((wallet) => (
            <span className={styles.wallet} key={wallet}>
              {wallet}
            </span>
          ))}
        </div>

        <div className={styles.actions}>
          <button
            className={styles.primary}
            type="button"
            aria-expanded={showInstructions}
            onClick={() => setShowInstructions((open) => !open)}
          >
            {showInstructions ? "Hide wallet instructions" : "Open wallet instructions"}
          </button>

          {showInstructions ? (
            <div className={styles.instructions}>
              <ol>
                <li>Open your Solana wallet app on this device.</li>
                <li>
                  Find its in-app browser — Phantom and Jupiter list it under the
                  globe or compass icon.
                </li>
                <li>
                  Enter <code>{GWAP_APP_HOSTNAME}</code> in the wallet browser&rsquo;s
                  address bar.
                </li>
                <li>GWAP OS recognizes that wallet and takes it from there.</li>
              </ol>
            </div>
          ) : null}

          <button className={styles.secondary} type="button" onClick={copyAppLink}>
            Copy the GWAP OS link
          </button>
          <a className={styles.secondary} href={PUBLIC_SITE_URL}>
            Visit GwapSpot.com
          </a>
          <button className={styles.secondary} type="button" onClick={onRetry}>
            Already in a wallet browser? Detect again
          </button>
        </div>

        <p className={styles.status} role="status">
          {copyState}
        </p>
        <p className={styles.hostLine}>
          GwapSpot.com is the public gateway. {GWAP_APP_HOSTNAME} is GWAP OS
          inside your wallet.
        </p>
      </div>
    </main>
  );
}

function DetectingWalletHost() {
  return (
    <main className={styles.gate} aria-busy="true">
      <div className={`${styles.panel} ${styles.detecting}`}>
        <span className={styles.pulse} aria-hidden="true" />
        <span className={styles.kicker}>DETECTING WALLET</span>
        <p className={styles.body} role="status">
          Looking for your Solana wallet…
        </p>
      </div>
    </main>
  );
}

/**
 * Second of the two gates from the app-domain contract. The hostname gate runs
 * in the proxy; this one establishes that the client is a supported Solana
 * wallet environment before any GWAP OS surface renders.
 *
 * Off the app hostname this is transparent, so gwapspot.com and preview
 * deployments are untouched.
 */
export function WalletHostGate({ children }: { children: ReactNode }) {
  const { isAppHost, phase, resolution, retry } = useWalletHost();

  if (!isAppHost) {
    return (
      <WalletHostContext.Provider value={resolution}>
        {children}
      </WalletHostContext.Provider>
    );
  }

  if (phase === "detecting") return <DetectingWalletHost />;
  if (resolution.status === "browser") return <WalletHostRequired onRetry={retry} />;

  return (
    <WalletHostContext.Provider value={resolution}>
      {children}
    </WalletHostContext.Provider>
  );
}
