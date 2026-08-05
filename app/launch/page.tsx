import type { Metadata } from "next";
import Link from "next/link";
import { ArrowIcon, PageHero, PageShell, SparkIcon } from "../components/site-shell";
import { ecosystemProducts } from "../lib/ecosystem";
import Launchpad from "./launchpad";

export const metadata: Metadata = {
  title: "Launchpad",
  description:
    "Search, filter, and launch products across the GWAP ecosystem from one gateway.",
  alternates: { canonical: "/launch" },
};

export default function LaunchPage() {
  const availableNow = ecosystemProducts.filter((product) => product.externalUrl).length;

  return (
    <PageShell>
      <PageHero
        eyebrow="GWAP launchpad"
        title="Find the right product. Start moving."
        description="The launchpad is the practical gateway into GWAP. Search by use case, filter by release status, open product details, or launch available products directly."
      >
        <Link className="primary-button" href="#products">
          Open launchpad <ArrowIcon />
        </Link>
        <Link className="secondary-button" href="/ecosystem">
          Read the full directory
        </Link>
      </PageHero>

      <section className="inner-section launch-summary">
        <div className="summary-stat">
          <span>ECOSYSTEM PRODUCTS</span>
          <strong>{String(ecosystemProducts.length).padStart(2, "0")}</strong>
        </div>
        <div className="summary-stat">
          <span>AVAILABLE NOW</span>
          <strong>{String(availableNow).padStart(2, "0")}</strong>
        </div>
        <div className="summary-stat">
          <span>ONE GATEWAY</span>
          <strong>01</strong>
        </div>
      </section>

      <section className="inner-section" id="products">
        <div className="inner-section-heading">
          <span className="eyebrow">
            <SparkIcon /> Product gateway
          </span>
          <h2>Use the network by purpose, not by guesswork.</h2>
          <p>
            Live and beta products can be opened immediately. Development and planned products remain visible so the ecosystem direction stays clear without pretending unfinished work is ready.
          </p>
        </div>
        <Launchpad products={ecosystemProducts} />
      </section>

      <section className="inner-section">
        <div className="cta-panel">
          <div>
            <span className="eyebrow">
              <SparkIcon /> Integration comes next
            </span>
            <h2>The launchpad becomes the front door to GWAP OS.</h2>
            <p>
              The next operating layer will add accounts, wallet connectivity, shared profiles, and personalized product access without replacing the independent ventures.
            </p>
          </div>
          <Link className="primary-button" href="/roadmap">
            View integration roadmap <ArrowIcon />
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
