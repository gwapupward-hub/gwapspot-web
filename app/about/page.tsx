import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowIcon,
  PageHero,
  PageShell,
  SparkIcon,
} from "../components/site-shell";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn how GWAP connects identity, trust, commerce, creativity, knowledge, and community into one purpose-driven ecosystem.",
  alternates: { canonical: "/about" },
};

const principles = [
  {
    number: "01",
    title: "Purpose before noise",
    body: "GWAP prioritizes practical infrastructure, clear user value, and disciplined execution over short-lived hype.",
  },
  {
    number: "02",
    title: "Independent, but connected",
    body: "Each venture must solve a real problem on its own while becoming stronger through shared identity, trust, and distribution.",
  },
  {
    number: "03",
    title: "Trust must be understandable",
    body: "Reputation, verification, ownership, and agreements should be visible enough to support better decisions without exposing everything.",
  },
  {
    number: "04",
    title: "Build in deliberate layers",
    body: "Foundation comes first. Expansion, integration, commerce, and the operating layer follow only when the earlier layer is stable.",
  },
] as const;

export default function AboutPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="About GWAP"
        title="Grind With A Purpose is the operating system."
        description="GWAP is an umbrella ecosystem for products that help people establish identity, build credibility, create, learn, transact, and participate in digital communities."
      >
        <Link className="primary-button" href="/ecosystem">
          Explore the ecosystem <ArrowIcon />
        </Link>
        <Link className="secondary-button" href="/roadmap">
          View the roadmap
        </Link>
      </PageHero>

      <section className="inner-section">
        <div className="inner-section-heading">
          <span className="eyebrow">
            <SparkIcon /> The thesis
          </span>
          <h2>Digital products should reinforce one another.</h2>
          <p>
            Most platforms isolate identity, reputation, payments, content,
            ownership, and community. GWAP is being built in the opposite
            direction: specialized ventures connected by shared infrastructure.
          </p>
        </div>

        <div className="feature-grid feature-grid-three">
          <article className="feature-card">
            <span>IDENTITY</span>
            <h3>Know who is participating.</h3>
            <p>
              GNS and verified profiles create a readable entry point for
              wallets, creators, businesses, and communities.
            </p>
          </article>
          <article className="feature-card">
            <span>TRUST</span>
            <h3>Understand credibility.</h3>
            <p>
              GwapScore, OCCO, and Private Proof Vault organize reputation,
              risk, and evidence into clearer decision tools.
            </p>
          </article>
          <article className="feature-card">
            <span>UTILITY</span>
            <h3>Turn infrastructure into action.</h3>
            <p>
              DIMI, Isnad Sunnah, the marketplace, and MN$ transform the shared
              network into creative, educational, commercial, and cultural use.
            </p>
          </article>
        </div>
      </section>

      <section className="inner-section">
        <div className="inner-section-heading">
          <span className="eyebrow">
            <SparkIcon /> Operating principles
          </span>
          <h2>Simple rules. Long-term execution.</h2>
        </div>
        <div className="principle-list">
          {principles.map((principle) => (
            <article key={principle.number}>
              <span>{principle.number}</span>
              <div>
                <h3>{principle.title}</h3>
                <p>{principle.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="inner-section">
        <div className="cta-panel">
          <div>
            <span className="eyebrow">
              <SparkIcon /> Build with the network
            </span>
            <h2>GWAP is designed to expand through focused partnerships.</h2>
            <p>
              The priority is not adding random products. It is connecting
              builders, communities, and infrastructure that strengthen the
              operating model.
            </p>
          </div>
          <Link className="primary-button" href="/contact">
            Partnership channels <ArrowIcon />
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
