import Link from "next/link";
import { ArrowIcon, PageHero, PageShell, SparkIcon } from "../components/site-shell";
import { createPageMetadata } from "../lib/metadata";

export const metadata = createPageMetadata({
  title: "GWAP Intelligence API for Developers",
  description:
    "Integrate GNS identity, GwapScore, Solana portfolio intelligence, and wallet exposure risk through one GWAP API.",
  path: "/developers",
});

const plans = [
  {
    name: "Developer",
    volume: "1,000 requests / month",
    burst: "60 requests / minute",
    description: "Self-service access for prototypes, testing, and early integrations.",
  },
  {
    name: "Growth",
    volume: "25,000 requests / month",
    burst: "300 requests / minute",
    description: "Paid capacity for active applications and production integrations.",
  },
  {
    name: "Scale",
    volume: "250,000 requests / month",
    burst: "1,000 requests / minute",
    description: "Paid capacity for higher-volume platforms and infrastructure workloads.",
  },
] as const;

export default function DevelopersPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Developer platform"
        title="One Solana wallet. One intelligence response."
        description="Use the GWAP Intelligence API to resolve GNS identity, canonical GwapScore reputation, asset intelligence, portfolio enrichment, and wallet exposure risk through one server-to-server endpoint."
      >
        <Link className="primary-button" href="/app/developer">
          Open developer console <ArrowIcon />
        </Link>
      </PageHero>

      <section className="inner-section">
        <div className="split-panel">
          <div>
            <span className="eyebrow"><SparkIcon /> Wallet Intelligence v1</span>
            <h2>Built for integration, not screenshots.</h2>
            <p>Authenticate with a <code>gwap_live_...</code> key and request intelligence for any valid Solana wallet.</p>
          </div>
          <div>
            <code>GET /api/v1/b2b/intelligence/:wallet</code>
            <p><code>x-api-key: gwap_live_...</code></p>
          </div>
        </div>
      </section>

      <section className="inner-section">
        <div className="contact-grid">
          {plans.map((plan) => (
            <article className="contact-card" key={plan.name}>
              <span>API PLAN</span>
              <h2>{plan.name}</h2>
              <p>{plan.description}</p>
              <strong>{plan.volume}</strong>
              <p>{plan.burst}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="inner-section">
        <div className="cta-panel">
          <div>
            <span className="eyebrow"><SparkIcon /> Start building</span>
            <h2>Create a key from GWAP OS.</h2>
            <p>The developer console handles credentials, account-wide quota, usage analytics, and paid Growth or Scale checkout.</p>
          </div>
          <Link className="primary-button" href="/app/developer">
            Developer console <ArrowIcon />
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
