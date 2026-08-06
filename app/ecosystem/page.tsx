import Link from "next/link";
import {
  ArrowIcon,
  PageHero,
  PageShell,
  ProductCard,
  SparkIcon,
} from "../components/site-shell";
import { ecosystemProducts } from "../lib/ecosystem";
import { createPageMetadata } from "../lib/metadata";

export const metadata = createPageMetadata({
  title: "Ecosystem",
  description:
    "Explore every product and infrastructure layer within the GWAP ecosystem.",
  path: "/ecosystem",
});

export default function EcosystemPage() {
  const liveCount = ecosystemProducts.filter(
    (product) => product.status === "Live",
  ).length;
  const activeCount = ecosystemProducts.filter(
    (product) => product.status !== "Planned",
  ).length;

  return (
    <PageShell>
      <PageHero
        eyebrow="Ecosystem directory"
        title="Eight ventures. One connected strategy."
        description="Each GWAP product has a defined role. Together they form a network for identity, reputation, creativity, knowledge, commerce, verification, and culture."
      >
        <Link className="primary-button" href="/roadmap">
          See how it connects <ArrowIcon />
        </Link>
      </PageHero>

      <section className="inner-section directory-summary">
        <div className="summary-stat">
          <span>PRODUCTS</span>
          <strong>{String(ecosystemProducts.length).padStart(2, "0")}</strong>
        </div>
        <div className="summary-stat">
          <span>LIVE</span>
          <strong>{String(liveCount).padStart(2, "0")}</strong>
        </div>
        <div className="summary-stat">
          <span>ACTIVE DEVELOPMENT</span>
          <strong>{String(activeCount).padStart(2, "0")}</strong>
        </div>
        <div className="summary-stat">
          <span>SHARED MISSION</span>
          <strong>01</strong>
        </div>
      </section>

      <section className="inner-section">
        <div className="inner-section-heading">
          <span className="eyebrow">
            <SparkIcon /> Complete directory
          </span>
          <h2>Choose a layer of the network.</h2>
          <p>
            Open any product page to see its purpose, current capabilities,
            audience, development roadmap, and live destination when available.
          </p>
        </div>
        <div className="ecosystem-grid">
          {ecosystemProducts.map((product, index) => (
            <ProductCard product={product} index={index} key={product.slug} />
          ))}
        </div>
      </section>

      <section className="inner-section">
        <div className="cta-panel">
          <div>
            <span className="eyebrow">
              <SparkIcon /> Partner with GWAP
            </span>
            <h2>Strong integrations beat isolated features.</h2>
            <p>
              GWAP is interested in infrastructure, distribution, data, and
              community partnerships that strengthen several ecosystem layers.
            </p>
          </div>
          <Link className="primary-button" href="/contact">
            Contact and partnerships <ArrowIcon />
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
