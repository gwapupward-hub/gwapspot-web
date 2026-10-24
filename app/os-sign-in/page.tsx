import type { Metadata, Viewport } from "next";
import { AppAccessColumn } from "../components/app-access-column";
import { AuthSetupRequired } from "../components/auth-setup-required";
import { isWalletAuthConfigured } from "../lib/auth-config";
import {
  gwapOsAppMetadata,
  gwapOsAppViewport,
} from "../lib/gwapos-app-metadata";
import { getSafeRedirectPath } from "../lib/safe-redirect";
import styles from "./gateway.module.css";

export const metadata: Metadata = {
  ...gwapOsAppMetadata,
  title: "Enter GWAP OS",
  description: "Simple account access to your GWAP workspace. Start with email; connect a wallet only when needed.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = gwapOsAppViewport;

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
            <small>YOUR TRUST WORKSPACE</small>
          </span>
        </div>

        <span className={styles.kicker}>BUILD TRUST. PROVE PROGRESS.</span>
        <h1 id="gwap-os-gateway-title">Everything you build should strengthen your credibility.</h1>
        <p>
          GWAP brings your identity, reputation, projects, and proof into one place.
          Start with email and get to work. Connect a wallet later only when you need
          blockchain-backed identity, reputation signals, or transactions.
        </p>

        <div className={styles.securityLine} aria-label="Authentication details">
          <span>EMAIL FIRST</span>
          <i aria-hidden="true" />
          <span>SECURE OTP</span>
          <i aria-hidden="true" />
          <span>WALLET OPTIONAL</span>
        </div>
      </section>

      <div className={styles.authColumn}>
        <AppAccessColumn redirectPath={redirectPath} sessionIssue={sessionIssue} />
      </div>
    </main>
  );
}
