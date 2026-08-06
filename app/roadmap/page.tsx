import Link from "next/link";
import {
  ArrowIcon,
  PageHero,
  PageShell,
  SparkIcon,
} from "../components/site-shell";
import { createPageMetadata } from "../lib/metadata";

export const metadata = createPageMetadata({
  title: "Roadmap",
  description:
    "Review the phased execution roadmap for the GWAP ecosystem.",
  path: "/roadmap",
});

const phases = [
  {
    phase: "Phase 01",
    title: "Foundation",
    status: "Complete",
    objective: "Establish a credible public gateway and production baseline.",
    deliverables: [
      "Flagship GWAP website and visual system",
      "Product positioning and ecosystem map",
      "Production analytics, error handling, security, and SEO",
      "GitHub-to-Vercel release workflow",
    ],
  },
  {
    phase: "Phase 02",
    title: "Expansion",
    status: "Current",
    objective: "Give every major venture a dedicated public destination.",
    deliverables: [
      "Complete ecosystem directory",
      "Dedicated product pages",
      "About, roadmap, community, and partnership pages",
      "Stronger internal navigation and search coverage",
    ],
  },
  {
    phase: "Phase 03",
    title: "Integration",
    status: "Next",
    objective: "Connect users and data across ecosystem products.",
    deliverables: [
      "Unified authentication and wallet connection",
      "Shared user and organization profiles",
      "GNS identity and GwapScore visibility",
      "Common analytics, notifications, and permissions",
    ],
  },
  {
    phase: "Phase 04",
    title: "Transactions",
    status: "Planned",
    objective: "Turn connected identity and trust into commercial utility.",
    deliverables: [
      "Marketplace listings and merchant tools",
      "Payments, escrow, disputes, and proof workflows",
      "Rewards, memberships, and ecosystem benefits",
      "Partner APIs and integration programs",
    ],
  },
  {
    phase: "Phase 05",
    title: "GWAP OS",
    status: "Planned",
    objective: "Deliver one personalized control center for the network.",
    deliverables: [
      "Unified dashboard across products",
      "Identity, score, proofs, assets, and activity",
      "Personalized product and community access",
      "Extensible operating layer for future ventures",
    ],
  },
] as const;

export default function RoadmapPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Execution roadmap"
        title="Build the layers in the right order."
        description="GWAP is intentionally phased. Each layer must become stable enough to support the next without creating an expensive pile of disconnected features."
      >
        <Link className="primary-button" href="/ecosystem">
          Review the products <ArrowIcon />
        </Link>
      </PageHero>

      <section className="inner-section">
        <div className="phase-list">
          {phases.map((item, index) => (
            <article
              className={`phase-card ${item.status === "Current" ? "current" : ""}`}
              key={item.phase}
            >
              <div className="phase-index">{String(index + 1).padStart(2, "0")}</div>
              <div className="phase-copy">
                <div className="phase-meta">
                  <span>{item.phase}</span>
                  <small>{item.status}</small>
                </div>
                <h2>{item.title}</h2>
                <p>{item.objective}</p>
              </div>
              <ul>
                {item.deliverables.map((deliverable) => (
                  <li key={deliverable}>{deliverable}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="inner-section">
        <div className="cta-panel">
          <div>
            <span className="eyebrow">
              <SparkIcon /> Current priority
            </span>
            <h2>Finish expansion before paying for heavy integration.</h2>
            <p>
              The disciplined move is to prove demand, improve discovery, and
              clarify product roles before adding shared authentication,
              databases, and transaction infrastructure.
            </p>
          </div>
          <Link className="primary-button" href="/contact">
            Discuss a strategic partnership <ArrowIcon />
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
