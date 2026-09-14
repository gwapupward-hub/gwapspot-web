import Link from "next/link";
import {
  ArrowIcon,
  PageHero,
  PageShell,
  SparkIcon,
} from "../components/site-shell";
import { createPageMetadata } from "../lib/metadata";
import { roadmapPhases } from "../lib/roadmap";

export const metadata = createPageMetadata({
  title: "Roadmap",
  description:
    "Review the phased execution roadmap for the GWAP ecosystem.",
  path: "/roadmap",
});

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
          {roadmapPhases.map((item, index) => (
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
