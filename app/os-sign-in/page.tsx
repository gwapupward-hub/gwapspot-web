import type { Metadata } from "next";
import { AuthSetupRequired } from "../components/auth-setup-required";
import { WalletAuthProvider } from "../components/wallet-auth-provider";
import { WalletHostGate } from "../components/wallet-host-gate";
import { isWalletAuthConfigured } from "../lib/auth-config";
import { getSafeRedirectPath } from "../lib/safe-redirect";
import styles from "./gateway.module.css";

export const metadata: Metadata = {
  title: "Enter GWAP OS",
  description: "Secure wallet access to GWAP OS.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function GwapOsSignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    redirect_url?: string | string[];
    session_issue?: string | string[];
  }>;
}) {
  if (!isWalletAuthConfigured()) return <AuthSetupRequired />;

  const query = await searchParams;
  const redirectPath = getSafeRedirectPath(
    Array.isArray(query.redirect_url) ? query.redirect_url[0] : query.redirect_url,
  );
  const sessionIssue =
    (Array.isArray(query.session_issue) ? query.session_issue[0] : query.session_issue) ===
    "1";

  return (
    <WalletAuthProvider walletOnly>
      <main className={styles.gateway}>
        <div className={styles.ambientOne} aria-hidden="true" />
        <div className={styles.ambientTwo} aria-hidden="true" />

        <section className={styles.identityIntro} aria-labelledby="gwap-os-gateway-title">
          <div className={styles.brandLine}>
            <span className={styles.brandMark} aria-hidden="true">
              <img
                src="/logos/gwap-agent-clear.svg"
                alt=""
                width={46}
                height={46}
                decoding="async"
              />
            </span>
            <span className={styles.brandCopy}>
              <strong>GWAP OS</strong>
              <small>DIRECT APPLICATION ACCESS</small>
            </span>
          </div>

          <span className={styles.kicker}>IDENTITY GATEWAY</span>
          <h1 id="gwap-os-gateway-title">Enter your GWAP workspace.</h1>
          <p>
            One wallet unlocks your identity, applications, activity, and GWAP
            workspace. Authentication uses a signed Solana message—not a transaction.
          </p>

          <div className={styles.securityLine} aria-label="Authentication details">
            <span>SIGNATURE ONLY</span>
            <i aria-hidden="true" />
            <span>NO TRANSACTION</span>
            <i aria-hidden="true" />
            <span>NO SOL FEE</span>
          </div>
        </section>

        <div className={styles.authColumn}>
          <WalletHostGate redirectPath={redirectPath} sessionIssue={sessionIssue} />
        </div>
      </main>
    </WalletAuthProvider>
  );
}
