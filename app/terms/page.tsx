import Link from "next/link";
import { PageHero, PageShell, SparkIcon } from "../components/site-shell";
import { createPageMetadata } from "../lib/metadata";

export const metadata = createPageMetadata({
  title: "Terms of Use",
  description:
    "Terms governing use of gwapspot.com, GWAP OS, Public Proof, developer APIs, and related GWAP services.",
  path: "/terms",
});

const UPDATED = "August 21, 2026";

export default function TermsPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Terms"
        title="Use GWAP with purpose—and responsibly."
        description={`Last updated ${UPDATED}. These Terms govern access to gwapspot.com, GWAP OS, GWAP Public Proof, developer APIs, and related GWAP services unless a product publishes additional terms.`}
      />

      <section className="inner-section">
        <div className="split-panel">
          <div>
            <span className="eyebrow"><SparkIcon /> Eligibility and accounts</span>
            <h2>You are responsible for the account and credentials you control.</h2>
          </div>
          <div>
            <p>You must use GWAP lawfully and provide accurate information when a feature requires it. You are responsible for safeguarding wallets, authentication methods, API keys, linked accounts, and devices used to access GWAP.</p>
            <p>Do not attempt to impersonate another person or organization, falsely claim control of an external account, or submit another person's content as your own verification evidence.</p>
          </div>
        </div>
      </section>

      <section className="inner-section">
        <div className="contact-grid">
          <article className="contact-card">
            <span>PUBLIC PROOF</span>
            <h2>Verification is evidence-based.</h2>
            <p>GWAP Public Proof verifies a submitted public X post against a one-time challenge and the returned post author. A successful result means GWAP observed evidence of control at the time of verification; it is not a guarantee of identity, character, future conduct, or account security.</p>
          </article>
          <article className="contact-card">
            <span>REPUTATION</span>
            <h2>Trust signals are informational.</h2>
            <p>GwapScore, Trust Graph, Wallet Intelligence, identity signals, and related outputs are informational tools. They should not be treated as guarantees, credit decisions, legal determinations, or professional advice.</p>
          </article>
          <article className="contact-card">
            <span>BLOCKCHAIN</span>
            <h2>On-chain actions carry risk.</h2>
            <p>Blockchain transactions may be irreversible and can involve network fees, third-party smart contracts, token volatility, and protocol risk. Review transaction details before signing.</p>
          </article>
        </div>
      </section>

      <section className="inner-section">
        <div className="split-panel">
          <div>
            <span className="eyebrow"><SparkIcon /> Acceptable use</span>
            <h2>Do not abuse the platform or its trust systems.</h2>
          </div>
          <div>
            <p>You may not interfere with service operation, bypass access controls or rate limits, distribute malicious code, scrape or automate access in violation of published restrictions, misuse verification challenges, manipulate trust or reputation signals, attack other users, or use GWAP in violation of applicable law.</p>
            <p>GWAP may suspend or restrict access when reasonably necessary to protect users, infrastructure, third-party services, or the integrity of verification and reputation systems.</p>
          </div>
        </div>
      </section>

      <section className="inner-section">
        <div className="split-panel">
          <div>
            <span className="eyebrow"><SparkIcon /> APIs and third-party services</span>
            <h2>External platforms have their own rules.</h2>
          </div>
          <div>
            <p>GWAP depends on third-party services including hosting, authentication, blockchain infrastructure, market-data providers, payment services, and social APIs. Availability may change based on those providers.</p>
            <p>Use of X through GWAP Public Proof is limited to the verification functionality described on the <Link href="/public-proof">Public Proof page</Link> and remains subject to applicable X platform terms and API access rules.</p>
            <p>Developer API customers must protect API credentials and comply with published quotas, technical restrictions, and documentation.</p>
          </div>
        </div>
      </section>

      <section className="inner-section">
        <div className="split-panel">
          <div>
            <span className="eyebrow"><SparkIcon /> No financial or professional advice</span>
            <h2>GWAP provides tools, not professional advice.</h2>
          </div>
          <div>
            <p>Nothing provided by GWAP constitutes investment, financial, lending, credit, legal, tax, accounting, or other professional advice. Digital assets and blockchain applications involve substantial risk. You are responsible for your own decisions and due diligence.</p>
          </div>
        </div>
      </section>

      <section className="inner-section">
        <div className="split-panel">
          <div>
            <span className="eyebrow"><SparkIcon /> Service changes and disclaimers</span>
            <h2>Products evolve.</h2>
          </div>
          <div>
            <p>GWAP may add, modify, pause, or discontinue features as the ecosystem develops. Roadmap items, previews, beta features, scores, availability statements, and product descriptions may change.</p>
            <p>Services are provided on an as-available basis to the extent permitted by law. GWAP does not guarantee uninterrupted availability, perfect accuracy, or that every third-party data source will remain accessible.</p>
          </div>
        </div>
      </section>

      <section className="inner-section">
        <div className="cta-panel">
          <div>
            <span className="eyebrow"><SparkIcon /> Questions</span>
            <h2>Need clarification?</h2>
            <p>Review the documentation and privacy policy or use GWAP's official contact channels.</p>
          </div>
          <div className="inner-hero-actions">
            <Link className="primary-button" href="/docs">Read docs</Link>
            <Link className="secondary-button" href="/privacy">Privacy</Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
