import Image from "next/image";
import Link from "next/link";
import {
  ArrowIcon,
  ProductCard,
  SiteFooter,
  SiteHeader,
  SparkIcon,
  SocialGrid,
} from "./components/site-shell";
import { ecosystemProducts } from "./lib/ecosystem";

export default function Home() {
  return (
    <main>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <SiteHeader />

      <section className="hero" id="top">
        <div className="hero-badge">
          <span /> The official GWAP ecosystem
        </div>
        <h1>
          One ecosystem.
          <span>Built with purpose.</span>
        </h1>
        <p className="hero-copy">
          GWAP connects digital identity, reputation, commerce, creativity, AI,
          and community through a growing network of products designed to work
          together.
        </p>
        <div className="hero-actions">
          <Link className="primary-button" href="/ecosystem">
            Explore the ecosystem <ArrowIcon />
          </Link>
          <Link className="secondary-button" href="/about">
            Learn about GWAP
          </Link>
        </div>

        <div className="hero-console" aria-label="GWAP ecosystem overview">
          <div className="console-topbar">
            <div className="console-dots">
              <i />
              <i />
              <i />
            </div>
            <span>GWAP ECOSYSTEM / ONLINE</span>
            <span className="console-status">
              <i /> Systems active
            </span>
          </div>
          <div className="console-grid">
            <div className="console-panel console-brand-panel">
              <div className="console-logo">
                <Image src="/logo.png" alt="GWAP" width={180} height={180} />
              </div>
              <div>
                <span className="console-kicker">CORE NETWORK</span>
                <strong>GWAP</strong>
                <p>Purpose-driven digital infrastructure.</p>
              </div>
            </div>
            <div className="console-panel console-stats">
              <div>
                <span>PRODUCTS</span>
                <strong>08</strong>
              </div>
              <div>
                <span>LIVE</span>
                <strong>04</strong>
              </div>
              <div>
                <span>BETA</span>
                <strong>01</strong>
              </div>
              <div>
                <span>BUILDING</span>
                <strong>03</strong>
              </div>
            </div>
            <div className="console-panel console-orbit">
              <div className="orbit-ring ring-one" />
              <div className="orbit-ring ring-two" />
              <div className="orbit-core">
                <Image src="/logo.png" alt="" width={46} height={46} />
              </div>
              <span className="orbit-node node-one">GNS</span>
              <span className="orbit-node node-two">DIMI</span>
              <span className="orbit-node node-three">AI</span>
              <span className="orbit-node node-four">SCORE</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section ecosystem-section" id="ecosystem">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              <SparkIcon /> Connected by design
            </span>
            <h2>Explore the ecosystem</h2>
          </div>
          <p>
            Independent products. Shared infrastructure. One recognizable
            gateway into everything GWAP is building.
          </p>
        </div>

        <div className="ecosystem-grid">
          {ecosystemProducts.map((product, index) => (
            <ProductCard product={product} index={index} key={product.slug} />
          ))}
        </div>

        <div className="section-action">
          <Link className="secondary-button" href="/ecosystem">
            View the complete directory <ArrowIcon />
          </Link>
        </div>
      </section>

      <section className="section mission-section" id="mission">
        <div className="mission-card">
          <div className="mission-copy">
            <span className="eyebrow">
              <SparkIcon /> Our operating principle
            </span>
            <h2>Technology should create leverage—not confusion.</h2>
            <p>
              GWAP is being built as a practical ecosystem where identity,
              trust, creativity, knowledge, and commerce reinforce one another.
              Every product has a clear role. Every release moves the network
              forward.
            </p>
            <Link className="text-link" href="/about">
              Read the operating model <ArrowIcon />
            </Link>
          </div>
          <div className="principles">
            <div>
              <span>01</span>
              <strong>Purpose first</strong>
              <p>Build useful systems before chasing noise.</p>
            </div>
            <div>
              <span>02</span>
              <strong>Trust by design</strong>
              <p>Make reputation and verification understandable.</p>
            </div>
            <div>
              <span>03</span>
              <strong>Open expansion</strong>
              <p>Create infrastructure that new products can plug into.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section roadmap-section" id="roadmap">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              <SparkIcon /> Execution roadmap
            </span>
            <h2>Built in deliberate phases</h2>
          </div>
          <p>
            The public website established the foundation. The current focus is
            expanding product discovery before shared ecosystem integration.
          </p>
        </div>
        <div className="roadmap-track">
          <article className="roadmap-item">
            <span>Phase 01</span>
            <h3>Foundation</h3>
            <p>
              Flagship website, design system, production hardening, analytics,
              and core ecosystem positioning.
            </p>
            <small>Complete</small>
          </article>
          <article className="roadmap-item active">
            <span>Phase 02</span>
            <h3>Expansion</h3>
            <p>
              Dedicated product pages, ecosystem directory, public roadmap,
              community, and partnership surfaces.
            </p>
            <small>Current</small>
          </article>
          <article className="roadmap-item">
            <span>Phase 03</span>
            <h3>Integration</h3>
            <p>
              Unified authentication, wallet connectivity, profiles, and shared
              data across products.
            </p>
            <small>Next</small>
          </article>
        </div>
        <div className="section-action">
          <Link className="secondary-button" href="/roadmap">
            View the full roadmap <ArrowIcon />
          </Link>
        </div>
      </section>

      <section className="section community-section" id="community">
        <div className="community-card">
          <div>
            <span className="eyebrow">
              <SparkIcon /> Join the network
            </span>
            <h2>Follow the build in public.</h2>
            <p>
              Product releases, community updates, development progress, and
              the next chapter of the GWAP ecosystem.
            </p>
          </div>
          <SocialGrid />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
