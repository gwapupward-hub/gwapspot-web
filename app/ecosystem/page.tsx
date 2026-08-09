import Link from "next/link";
import {
  ArrowIcon,
  PageHero,
  PageShell,
  ProductCard,
  SparkIcon,
} from "../components/site-shell";
import {
  ecosystemProductGroups,
  ecosystemProductIndexBySlug,
  ecosystemProducts,
} from "../lib/ecosystem";
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
        title="Eight ventures. Two connected layers."
        description="GWAP Infrastructure supplies identity, reputation, intelligence, and verification. GWAP Experiences turn those systems into products people can use."
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
            <SparkIcon /> Organized ecosystem
          </span>
          <h2>Start with the layer you need.</h2>
          <p>
            Infrastructure powers the network. Experiences put that foundation
            in front of users, creators, communities, and businesses.
          </p>
        </div>
        <div className="ecosystem-groups directory-ecosystem-groups">
          {ecosystemProductGroups.map((group, groupIndex) => (
            <section
              className={`ecosystem-group ecosystem-group-${group.id}`}
              aria-labelledby={`directory-group-${group.id}`}
              key={group.id}
            >
              <header className="ecosystem-group-header">
                <div className="ecosystem-group-index">
                  <span>{String(groupIndex + 1).padStart(2, "0")}</span>
                  <small>{group.eyebrow}</small>
                </div>
                <div className="ecosystem-group-copy">
                  <h3 id={`directory-group-${group.id}`}>{group.label}</h3>
                  <p>{group.description}</p>
                </div>
                <ul className="ecosystem-group-signals" aria-label={`${group.label} layers`}>
                  {group.signals.map((signal) => <li key={signal}>{signal}</li>)}
                </ul>
              </header>
              <div className="ecosystem-grid directory-group-products">
                {group.products.map((product) => {
                  const productIndex = ecosystemProductIndexBySlug.get(product.slug) ?? 0;
                  return (
                    <ProductCard
                      product={product}
                      index={productIndex}
                      headingLevel="h4"
                      key={product.slug}
                    />
                  );
                })}
              </div>
            </section>
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
