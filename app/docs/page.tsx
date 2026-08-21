import Link from "next/link";
import { ArrowIcon, PageHero, PageShell, SparkIcon } from "../components/site-shell";
import { createPageMetadata } from "../lib/metadata";

export const metadata = createPageMetadata({
  title: "GWAP Documentation",
  description:
    "Documentation for GWAP OS, Public Proof, GNS, GwapScore, Wallet Intelligence, and developer APIs.",
  path: "/docs",
});

const docs = [
  {
    title: "GWAP OS",
    description:
      "The account and operating layer that connects identity, wallets, reputation, proofs, developer tools, and ecosystem activity.",
    href: "/app",
    label: "Open GWAP OS",
  },
  {
    title: "GWAP Public Proof",
    description:
      "Public-post Proof of Control for X. GWAP reads a submitted public post through X API v2 and verifies the one-time challenge plus post author.",
    href: "/public-proof",
    label: "Read Public Proof docs",
  },
  {
    title: "Developer API",
    description:
      "Server-to-server Wallet Intelligence combining identity, reputation, Solana assets, portfolio enrichment, and wallet exposure risk.",
    href: "/developers",
    label: "Developer platform",
  },
  {
    title: "Privacy and data handling",
    description:
      "How GWAP handles account, blockchain, API, and social verification data across public and authenticated product surfaces.",
    href: "/privacy",
    label: "Privacy policy",
  },
] as const;

export default function DocsPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="GWAP documentation"
        title="Understand the infrastructure behind the interface."
        description="GWAP documentation explains how identity, trust, social Proof of Control, wallet intelligence, and developer access work across the ecosystem."
      />

      <section className="inner-section">
        <div className="contact-grid">
          {docs.map((doc) => (
            <article className="contact-card" key={doc.title}>
              <span>DOCUMENTATION</span>
              <h2>{doc.title}</h2>
              <p>{doc.description}</p>
              <Link href={doc.href}>{doc.label} <ArrowIcon /></Link>
            </article>
          ))}
        </div>
      </section>

      <section className="inner-section">
        <div className="split-panel">
          <div>
            <span className="eyebrow"><SparkIcon /> Public Proof technical reference</span>
            <h2>X integration is narrow and read-only.</h2>
            <p>
              GWAP Public Proof does not ask X to publish on a user's behalf. The user publishes a generated challenge, then GWAP reads only the submitted public post and author data needed to verify Proof of Control.
            </p>
          </div>
          <div>
            <code>GET https://api.x.com/2/tweets/:id</code>
            <p><code>tweet.fields=author_id</code></p>
            <p><code>expansions=author_id</code></p>
            <p><code>user.fields=username</code></p>
            <p>The returned post text must contain the exact active GWAP challenge, and the returned author must match the claimed X account before verification succeeds.</p>
          </div>
        </div>
      </section>

      <section className="inner-section">
        <div className="split-panel">
          <div>
            <span className="eyebrow"><SparkIcon /> Trust model</span>
            <h2>Verification and reputation are separate concepts.</h2>
          </div>
          <div>
            <p><strong>Proof of Control</strong> establishes that an authenticated GWAP user demonstrated control of an external account using an approved verification method.</p>
            <p><strong>Trust Graph</strong> explains which verified and incomplete trust signals are connected to the GWAP account.</p>
            <p><strong>Relationship Graph</strong> explains why identities and accounts are linked and records the provenance of those relationships.</p>
            <p><strong>GwapScore</strong> remains a separate reputation product. Public Proof verification does not automatically rewrite the scoring model.</p>
          </div>
        </div>
      </section>

      <section className="inner-section">
        <div className="cta-panel">
          <div>
            <span className="eyebrow"><SparkIcon /> Developers</span>
            <h2>Build with GWAP infrastructure.</h2>
            <p>Developer access, API keys, quotas, and Wallet Intelligence are managed through the GWAP OS developer console.</p>
          </div>
          <Link className="primary-button" href="/developers">
            Developer docs <ArrowIcon />
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
