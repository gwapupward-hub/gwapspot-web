import Image from "next/image";

const ecosystem = [
  {
    name: "GNS",
    eyebrow: "Digital identity",
    description: ".gwap names, wallet-linked profiles, and a portable identity layer for the open web.",
    status: "Live",
    href: "https://gwapspot.fun/",
    accent: "green",
  },
  {
    name: "GwapScore",
    eyebrow: "On-chain reputation",
    description: "A transparent 300–900 reputation and credit-intelligence layer for wallets and applications.",
    status: "Live",
    href: "https://gwapspot.fun/",
    accent: "green",
  },
  {
    name: "DIMI",
    eyebrow: "Creator technology",
    description: "A music creation and collaboration platform built for modern artists and digital ownership.",
    status: "Beta",
    href: "https://dimimusic.xyz/",
    accent: "purple",
  },
  {
    name: "Isnad Sunnah",
    eyebrow: "Islamic AI",
    description: "An AI-powered Islamic knowledge assistant grounded in the Qur’an, Sunnah, and trusted scholarship.",
    status: "Live",
    href: "https://isnadsunnah.vercel.app/",
    accent: "green",
  },
  {
    name: "Money Neva $leeps",
    eyebrow: "Lifestyle brand",
    description: "Street-luxury apparel and culture built around ambition, discipline, and purposeful hustle.",
    status: "Live",
    href: "https://slink.bigovideo.tv/xkN2rK",
    accent: "orange",
  },
  {
    name: "GwapSpot Marketplace",
    eyebrow: "Digital commerce",
    description: "A unified marketplace for ecosystem products, services, creators, and verified participants.",
    status: "In Development",
    href: "#roadmap",
    accent: "orange",
  },
  {
    name: "OCCO",
    eyebrow: "Credit infrastructure",
    description: "A planned on-chain credit bureau designed to make wallet-level risk and credibility understandable.",
    status: "Planned",
    href: "#roadmap",
    accent: "purple",
  },
  {
    name: "Private Proof Vault",
    eyebrow: "Verification layer",
    description: "A planned privacy-aware system for storing, managing, and verifying important digital proofs.",
    status: "Planned",
    href: "#roadmap",
    accent: "purple",
  },
] as const;

const socials = [
  { label: "X", href: "https://x.com/_gwapspot?s=21" },
  { label: "Telegram", href: "https://t.me/thagwapspot" },
  { label: "GitHub", href: "https://github.com/Gwapoholics" },
  { label: "Instagram", href: "https://www.instagram.com/_gwapspot?igsh=emlydnV6eXljYjd4" },
] as const;

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path d="M4 10h11M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d="M12 2l1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" fill="currentColor" />
    </svg>
  );
}

export default function Home() {
  return (
    <main>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="site-header">
        <a className="brand" href="#top" aria-label="GWAP home">
          <span className="brand-mark">
            <Image src="/logo.png" alt="" width={40} height={40} priority />
          </span>
          <span className="brand-copy">
            <strong>GWAP</strong>
            <small>Grind With A Purpose</small>
          </span>
        </a>

        <nav className="desktop-nav" aria-label="Primary navigation">
          <a href="#ecosystem">Ecosystem</a>
          <a href="#mission">Mission</a>
          <a href="#roadmap">Roadmap</a>
          <a href="#community">Community</a>
        </nav>

        <a className="header-cta" href="#ecosystem">
          Explore <ArrowIcon />
        </a>
      </header>

      <section className="hero" id="top">
        <div className="hero-badge"><span /> The official GWAP ecosystem</div>
        <h1>
          One ecosystem.
          <span>Built with purpose.</span>
        </h1>
        <p className="hero-copy">
          GWAP connects digital identity, reputation, commerce, creativity, AI, and community through a growing network of products designed to work together.
        </p>
        <div className="hero-actions">
          <a className="primary-button" href="#ecosystem">Explore the ecosystem <ArrowIcon /></a>
          <a className="secondary-button" href="https://github.com/Gwapoholics" target="_blank" rel="noreferrer">View on GitHub</a>
        </div>
        <div className="hero-console" aria-label="GWAP ecosystem overview">
          <div className="console-topbar">
            <div className="console-dots"><i /><i /><i /></div>
            <span>GWAP ECOSYSTEM / ONLINE</span>
            <span className="console-status"><i /> Systems active</span>
          </div>
          <div className="console-grid">
            <div className="console-panel console-brand-panel">
              <div className="console-logo"><Image src="/logo.png" alt="GWAP" width={180} height={180} /></div>
              <div>
                <span className="console-kicker">CORE NETWORK</span>
                <strong>GWAP</strong>
                <p>Purpose-driven digital infrastructure.</p>
              </div>
            </div>
            <div className="console-panel console-stats">
              <div><span>PRODUCTS</span><strong>08</strong></div>
              <div><span>LIVE</span><strong>04</strong></div>
              <div><span>BETA</span><strong>01</strong></div>
              <div><span>BUILDING</span><strong>03</strong></div>
            </div>
            <div className="console-panel console-orbit">
              <div className="orbit-ring ring-one" />
              <div className="orbit-ring ring-two" />
              <div className="orbit-core"><Image src="/logo.png" alt="" width={46} height={46} /></div>
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
            <span className="eyebrow"><SparkIcon /> Connected by design</span>
            <h2>Explore the ecosystem</h2>
          </div>
          <p>Independent products. Shared infrastructure. One recognizable gateway into everything GWAP is building.</p>
        </div>

        <div className="ecosystem-grid">
          {ecosystem.map((product, index) => {
            const isExternal = product.href.startsWith("http");
            return (
              <a
                className={`product-card accent-${product.accent}`}
                href={product.href}
                key={product.name}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noreferrer" : undefined}
              >
                <div className="product-card-top">
                  <span className="product-number">{String(index + 1).padStart(2, "0")}</span>
                  <span className={`status status-${product.status.toLowerCase().replaceAll(" ", "-")}`}>{product.status}</span>
                </div>
                <div>
                  <span className="product-eyebrow">{product.eyebrow}</span>
                  <h3>{product.name}</h3>
                  <p>{product.description}</p>
                </div>
                <span className="product-link">{isExternal ? "Launch product" : "View roadmap"} <ArrowIcon /></span>
              </a>
            );
          })}
        </div>
      </section>

      <section className="section mission-section" id="mission">
        <div className="mission-card">
          <div className="mission-copy">
            <span className="eyebrow"><SparkIcon /> Our operating principle</span>
            <h2>Technology should create leverage—not confusion.</h2>
            <p>
              GWAP is being built as a practical ecosystem where identity, trust, creativity, knowledge, and commerce reinforce one another. Every product has a clear role. Every release moves the network forward.
            </p>
          </div>
          <div className="principles">
            <div><span>01</span><strong>Purpose first</strong><p>Build useful systems before chasing noise.</p></div>
            <div><span>02</span><strong>Trust by design</strong><p>Make reputation and verification understandable.</p></div>
            <div><span>03</span><strong>Open expansion</strong><p>Create infrastructure that new products can plug into.</p></div>
          </div>
        </div>
      </section>

      <section className="section roadmap-section" id="roadmap">
        <div className="section-heading">
          <div>
            <span className="eyebrow"><SparkIcon /> Execution roadmap</span>
            <h2>Built in deliberate phases</h2>
          </div>
          <p>The public website is the foundation. The long-term destination is a unified GWAP operating layer.</p>
        </div>
        <div className="roadmap-track">
          <article className="roadmap-item active">
            <span>Phase 01</span><h3>Foundation</h3><p>Flagship website, design system, ecosystem navigation, and product discovery.</p><small>Current</small>
          </article>
          <article className="roadmap-item">
            <span>Phase 02</span><h3>Integration</h3><p>Unified authentication, wallet connectivity, user profiles, and shared ecosystem data.</p><small>Next</small>
          </article>
          <article className="roadmap-item">
            <span>Phase 03</span><h3>GWAP OS</h3><p>A personalized control center for identity, score, products, rewards, and community.</p><small>Planned</small>
          </article>
        </div>
      </section>

      <section className="section community-section" id="community">
        <div className="community-card">
          <div>
            <span className="eyebrow"><SparkIcon /> Join the network</span>
            <h2>Follow the build in public.</h2>
            <p>Product releases, community updates, development progress, and the next chapter of the GWAP ecosystem.</p>
          </div>
          <div className="social-grid">
            {socials.map((social) => (
              <a href={social.href} target="_blank" rel="noreferrer" key={social.label}>
                <span>{social.label}</span><ArrowIcon />
              </a>
            ))}
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="footer-brand">
          <Image src="/logo.png" alt="" width={34} height={34} />
          <div><strong>GWAP</strong><span>Grind With A Purpose</span></div>
        </div>
        <p>Building connected digital infrastructure with purpose.</p>
        <div className="footer-links"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="#top">Back to top</a></div>
        <small>© {new Date().getFullYear()} GWAP. All rights reserved.</small>
      </footer>
    </main>
  );
}
