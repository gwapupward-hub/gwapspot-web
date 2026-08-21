import Link from "next/link";
import { PageHero, PageShell, SparkIcon } from "../components/site-shell";
import { createPageMetadata } from "../lib/metadata";

export const metadata = createPageMetadata({
  title: "Privacy Policy",
  description:
    "How GWAP handles account, wallet, social verification, product usage, and developer data.",
  path: "/privacy",
});

const UPDATED = "August 21, 2026";

export default function PrivacyPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Privacy"
        title="Privacy should be understandable."
        description={`Last updated ${UPDATED}. This policy explains the information GWAP processes when you use gwapspot.com, GWAP OS, GWAP Public Proof, and related GWAP services.`}
      />

      <section className="inner-section">
        <div className="split-panel">
          <div>
            <span className="eyebrow"><SparkIcon /> What we process</span>
            <h2>Data required to operate the product and explain trust provenance.</h2>
          </div>
          <div>
            <p><strong>Account and authentication data.</strong> GWAP may process account identifiers, authenticated wallet addresses, linked account state, and security/session information required to operate GWAP OS.</p>
            <p><strong>Blockchain data.</strong> Public wallet addresses and publicly available Solana transaction, token, naming, and protocol information may be processed to provide identity, portfolio, reputation, and wallet-intelligence features.</p>
            <p><strong>Product data.</strong> We may store profiles, preferences, saved ideas, projects, developer settings, API usage, and other information you intentionally create or configure in GWAP products.</p>
            <p><strong>Social verification data.</strong> For GWAP Public Proof, we may process the claimed social handle, one-time challenge, submitted public post URL and post ID, verification status, timestamps, and the stable platform account identifier returned by the platform API. Internal platform account identifiers are not displayed on public proof receipts.</p>
          </div>
        </div>
      </section>

      <section className="inner-section">
        <div className="contact-grid">
          <article className="contact-card">
            <span>X / PUBLIC PROOF</span>
            <h2>Read-only verification.</h2>
            <p>When you submit an X post for Public Proof, GWAP reads that specific public post through X API v2 to verify the one-time challenge and author. GWAP does not use Public Proof to post to X on your behalf or read Direct Messages.</p>
          </article>
          <article className="contact-card">
            <span>PUBLIC BLOCKCHAINS</span>
            <h2>On-chain data is already public.</h2>
            <p>Blockchain activity tied to a public wallet may remain independently visible on the underlying network even if you stop using GWAP. GWAP cannot erase data that exists on a public blockchain.</p>
          </article>
          <article className="contact-card">
            <span>SECURITY</span>
            <h2>Secrets stay server-side.</h2>
            <p>GWAP does not intentionally expose private API keys, authentication secrets, or private server credentials in public product surfaces.</p>
          </article>
        </div>
      </section>

      <section className="inner-section">
        <div className="split-panel">
          <div>
            <span className="eyebrow"><SparkIcon /> How information is used</span>
            <h2>Operate, secure, improve, and explain the service.</h2>
          </div>
          <div>
            <p>We use information to authenticate users, provide requested product functionality, maintain account relationships, generate trust and verification provenance, prevent abuse, enforce rate limits, support users, measure product reliability, and improve GWAP services.</p>
            <p>GWAP does not treat a matching username, profile picture, or self-asserted claim as verified Proof of Control. Verification requires the product-specific evidence described in the applicable flow.</p>
          </div>
        </div>
      </section>

      <section className="inner-section">
        <div className="split-panel">
          <div>
            <span className="eyebrow"><SparkIcon /> Service providers and third parties</span>
            <h2>Some features depend on infrastructure providers.</h2>
          </div>
          <div>
            <p>GWAP may use hosting, authentication, database, analytics, payment, blockchain infrastructure, and third-party API providers to operate the service. Those providers may process information according to their own terms and privacy policies.</p>
            <p>Public Proof uses X API data only for the verification purpose described on our <Link href="/public-proof">Public Proof page</Link>. Wallet features may query public blockchain and market-data services.</p>
          </div>
        </div>
      </section>

      <section className="inner-section">
        <div className="split-panel">
          <div>
            <span className="eyebrow"><SparkIcon /> Retention and choices</span>
            <h2>Your account state should remain manageable.</h2>
          </div>
          <div>
            <p>Retention periods vary by product and operational need. Verification records may be retained while a trust relationship remains active so GWAP can explain how that relationship was established. Revoked or expired states may be retained where necessary for abuse prevention, auditability, or security.</p>
            <p>Where supported, you can revoke linked verification relationships, update profile information, or delete your GWAP account from the applicable product settings. Account deletion cannot remove information independently recorded on public blockchains or third-party services.</p>
          </div>
        </div>
      </section>

      <section className="inner-section">
        <div className="cta-panel">
          <div>
            <span className="eyebrow"><SparkIcon /> Questions</span>
            <h2>Contact GWAP through the official channels.</h2>
            <p>For privacy questions, account issues, or data-handling concerns, use the contact channels published by GWAP.</p>
          </div>
          <Link className="primary-button" href="/contact">Contact GWAP</Link>
        </div>
      </section>
    </PageShell>
  );
}
