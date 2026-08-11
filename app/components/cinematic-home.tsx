"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { formatBuildLogDate, latestBuildLogEntry } from "../lib/changelog";
import { ecosystemProductGroups, ecosystemProductIndexBySlug, ecosystemProducts, getProductDestination, isExternalProductDestination, socialLinks } from "../lib/ecosystem";
import { CountUp } from "./count-up";
import { GwapEcosystemGraph } from "./gwap-ecosystem-graph";
import { HomeUtility } from "./home-utility";

type IconName = "arrow" | "search" | "menu" | "close" | "spark" | "shield" | "network";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    spark: <><path d="m12 2 1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2Z" /><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" /></>,
    shield: <><path d="M12 3 20 6v5c0 5-3.3 8.5-8 10-4.7-1.5-8-5-8-10V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
    network: <><circle cx="12" cy="12" r="3" /><circle cx="4" cy="7" r="2" /><circle cx="20" cy="7" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="19" r="2" /><path d="m6 8.2 3.4 2M18 8.2l-3.4 2M7.7 17.7l2.5-3.2M16.3 17.7l-2.5-3.2" /></>,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

function GlassButton({ href, children, primary = false }: { href: string; children: ReactNode; primary?: boolean }) {
  return (
    <Link className={`glass-button${primary ? " is-primary" : ""}`} href={href}>
      <span>{children}</span>
      <Icon name="arrow" />
    </Link>
  );
}

export function CinematicHome() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const searchDialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-story-section]"));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      sections.forEach((section) => section.classList.add("is-active"));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const section = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          section.classList.add("is-active");
          section.classList.remove("is-past");
        } else {
          section.classList.remove("is-active");
          if (entry.boundingClientRect.top < 0) section.classList.add("is-past");
          else section.classList.remove("is-past");
        }
      });
    }, { rootMargin: "-18% 0px -22%", threshold: [0.12, 0.45, 0.7] });

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0;
    const updateNavState = () => {
      frame = 0;
      navRef.current?.classList.toggle("is-scrolled", window.scrollY > 48);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(updateNavState);
    };

    updateNavState();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const searchButton = searchButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => searchInputRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSearchOpen(false);
        return;
      }

      if (event.key !== "Tab") return;

      const dialog = searchDialogRef.current;
      if (!dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getAttribute("aria-hidden") !== "true");

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      searchButton?.focus();
    };
  }, [searchOpen]);

  const searchResults = ecosystemProducts.filter((product) => {
    const haystack = `${product.name} ${product.eyebrow} ${product.summary}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <main className="cinematic-home">
      <div className="living-background" aria-hidden="true">
        <div className="aurora aurora-green" />
        <div className="aurora aurora-purple" />
        <div className="aurora aurora-orange" />
        <div className="light-streak streak-one" />
        <div className="light-streak streak-two" />
        <div className="noise-layer" />
      </div>

      <header ref={navRef} className="cinematic-nav">
        <Link className="cinematic-brand" href="#top" aria-label="GWAPSpot home">
          <span className="cinematic-brand-mark"><Image src="/logos/gwap-agent-clear.svg" alt="" width={44} height={44} priority /></span>
          <span><strong>GWAP</strong><small>SPOT</small></span>
        </Link>

        <nav className={`cinematic-links${menuOpen ? " is-open" : ""}`} aria-label="Primary navigation">
          <Link className="cinematic-os-menu-link" href="/app" onClick={() => setMenuOpen(false)}>Open GWAP OS <Icon name="arrow" /></Link>
          <Link href="#ecosystem" onClick={() => setMenuOpen(false)}>Ecosystem</Link>
          <Link href="#trust" onClick={() => setMenuOpen(false)}>Infrastructure</Link>
          <Link href="#roadmap" onClick={() => setMenuOpen(false)}>Roadmap</Link>
          <Link href="/changelog" onClick={() => setMenuOpen(false)}>Build Log</Link>
          <Link href="/community" onClick={() => setMenuOpen(false)}>Community</Link>
        </nav>

        <div className="cinematic-nav-actions">
          <button ref={searchButtonRef} className="icon-button" type="button" aria-label="Search GWAP products" onClick={() => setSearchOpen(true)}><Icon name="search" /></button>
          <Link className="nav-contact nav-os-entry" href="/app">Open GWAP OS <Icon name="arrow" /></Link>
          <button className="icon-button menu-button" type="button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => setMenuOpen((current) => !current)}><Icon name={menuOpen ? "close" : "menu"} /></button>
        </div>
      </header>

      {searchOpen ? (
        <div ref={searchDialogRef} className="search-overlay" role="dialog" aria-modal="true" aria-label="Search the GWAP ecosystem" onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
          <div className="search-panel">
            <div className="search-field"><Icon name="search" /><input ref={searchInputRef} aria-label="Search GWAP products" value={query} onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)} placeholder="Search GNS, GwapScore, DIMI…" /><button type="button" onClick={() => setSearchOpen(false)} aria-label="Close search"><Icon name="close" /></button></div>
            <div className="search-results">
              {searchResults.map((product) => <Link href={`/ecosystem/${product.slug}`} key={product.slug} onClick={() => setSearchOpen(false)}><span><small>{product.eyebrow}</small><strong>{product.name}</strong></span><Icon name="arrow" /></Link>)}
              {searchResults.length === 0 ? <p>No products match that search.</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      <section className="story-section hero-story is-active" id="top" data-story-section>
        <div className="hero-light" aria-hidden="true" />
        <div className="hero-content">
          <span className="hero-pill"><i /> The flagship gateway to GWAP</span>
          <h1>Grind with<br /><em>a purpose.</em></h1>
          <p>Identity, reputation, commerce, creativity, intelligence, and community—connected inside one premium Web3 ecosystem.</p>
          <HomeUtility />
          <div className="hero-ctas"><GlassButton href="#ecosystem" primary>Explore the ecosystem</GlassButton><GlassButton href="/about">Discover the vision</GlassButton></div>
          <div className="hero-trust"><span><Icon name="shield" /> Explainable trust</span><span><Icon name="network" /> Connected products</span><span><Icon name="spark" /> Built for what is next</span></div>
        </div>

        <div className="emblem-stage" aria-label="Animated GWAP ecosystem emblem">
          <div className="emblem-halo halo-one" />
          <div className="emblem-halo halo-two" />
          <div className="emblem-ring ring-a"><span>GNS</span><span>DIMI</span></div>
          <div className="emblem-ring ring-b"><span>SCORE</span><span>AI</span></div>
          <Link className="emblem-core emblem-core-link" href="/app" aria-label="Open GWAP OS"><Image src="/logos/gwap-agent-clear.svg" alt="GWAP" width={280} height={280} priority /></Link>
          <div className="emblem-caption"><span>GWAP CORE</span><small>ECOSYSTEM ONLINE</small></div>
        </div>

        <a className="scroll-cue" href="#overview"><span>Scroll to enter</span><i /></a>
      </section>

      <section className="story-section overview-story" id="overview" data-story-section>
        <div className="section-kicker"><span>01</span><p>One network. Multiple engines.</p></div>
        <div className="overview-layout">
          <div className="overview-copy">
            <span className="eyebrow-premium"><Icon name="spark" /> The GWAP operating system</span>
            <h2>Built as an ecosystem,<br />not another landing page.</h2>
            <p>Every GWAP product has a focused role. Together, they create a connected layer for identity, trust, creators, transactions, and knowledge.</p>
          </div>
          <div className="metrics-glass">
            <div><strong><CountUp value={8} /></strong><span>Products</span><small>Across one shared vision</small></div>
            <div><strong><CountUp value={4} /></strong><span>Live</span><small>Working in public today</small></div>
            <div><strong><CountUp value={300} suffix="–900" /></strong><span>Score range</span><small>Explainable wallet reputation</small></div>
            <div><strong><CountUp value={1} suffix=" hub" /></strong><span>Gateway</span><small>GWAPSpot connects it all</small></div>
          </div>
        </div>
        <div className="depth-window">
          <div className="depth-grid" />
          <div className="depth-orbit"><div className="depth-core"><Image src="/logos/gwap-agent-clear.svg" alt="" width={90} height={90} /></div>{["IDENTITY", "REPUTATION", "COMMERCE", "CREATIVITY", "INTELLIGENCE"].map((label, index) => <span style={{ "--node-index": index } as CSSProperties} key={label}>{label}</span>)}</div>
          <div className="depth-label"><small>CONNECTED INFRASTRUCTURE</small><strong>Purpose compounds<br />when systems connect.</strong></div>
        </div>
      </section>

      <section className="story-section ecosystem-story" id="ecosystem" data-story-section>
        <div className="section-kicker"><span>02</span><p>Explore the product network.</p></div>
        <div className="premium-heading">
          <div><span className="eyebrow-premium"><Icon name="network" /> GWAP ecosystem</span><h2>Independent products.<br /><em>Shared momentum.</em></h2></div>
          <p>GWAP is an ecosystem studio building infrastructure and experiences around identity, reputation, commerce, creativity, and community.</p>
        </div>
        <GwapEcosystemGraph />
        <div className="ecosystem-groups">
          {ecosystemProductGroups.map((group, groupIndex) => (
            <section
              className={`ecosystem-group ecosystem-group-${group.id}`}
              aria-labelledby={`ecosystem-group-${group.id}`}
              key={group.id}
            >
              <header className="ecosystem-group-header">
                <div className="ecosystem-group-index">
                  <span>{String(groupIndex + 1).padStart(2, "0")}</span>
                  <small>{group.eyebrow}</small>
                </div>
                <div className="ecosystem-group-copy">
                  <h3 id={`ecosystem-group-${group.id}`}>{group.label}</h3>
                  <p>{group.description}</p>
                </div>
                <ul className="ecosystem-group-signals" aria-label={`${group.label} layers`}>
                  {group.signals.map((signal) => <li key={signal}>{signal}</li>)}
                </ul>
              </header>

              <div className="premium-product-grid ecosystem-group-products">
                {group.products.map((product) => {
                  const productIndex = ecosystemProductIndexBySlug.get(product.slug) ?? 0;
                  return (
                    <Link className={`premium-product-card accent-${product.accent}`} href={getProductDestination(product)} target={isExternalProductDestination(product) ? "_blank" : undefined} rel={isExternalProductDestination(product) ? "noreferrer" : undefined} data-gwap-product={product.slug} key={product.slug}>
                      <div className="card-reflection" />
                      <div className="product-card-header"><span>{String(productIndex + 1).padStart(2, "0")}</span><small>{product.status}</small></div>
                      <div className="product-glyph"><i /><b>{product.name.slice(0, 2).toUpperCase()}</b></div>
                      <div className="product-copy"><span className="product-category">{product.eyebrow}</span><h4>{product.name}</h4><p>{product.summary}</p></div>
                      <div className="product-card-footer"><span>Explore product</span><Icon name="arrow" /></div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="story-section trust-story" id="trust" data-story-section>
        <div className="section-kicker"><span>03</span><p>Infrastructure users can understand.</p></div>
        <div className="trust-stage">
          <div className="trust-copy"><span className="eyebrow-premium"><Icon name="shield" /> Trust by design</span><h2>Premium on the surface.<br /><em>Practical underneath.</em></h2><p>The interface is only the front door. GWAP is building clear identity, explainable reputation, interoperable products, and infrastructure that rewards real participation.</p><GlassButton href="/about" primary>How GWAP works</GlassButton></div>
          <div className="layer-stack" aria-label="GWAP infrastructure layers">
            <article className="stack-card stack-one"><span>01 / IDENTITY</span><strong>GNS</strong><p>Human-readable names and portable profiles.</p><i /></article>
            <article className="stack-card stack-two"><span>02 / REPUTATION</span><strong>GwapScore</strong><p>Transparent 300–900 wallet intelligence.</p><i /></article>
            <article className="stack-card stack-three"><span>03 / TRANSACTIONS</span><strong>Marketplace</strong><p>Verified commerce across the ecosystem.</p><i /></article>
          </div>
        </div>
        <div className="principle-strip"><span>Purpose first.</span><span>Trust by design.</span><span>Expansion without chaos.</span><span>Built to interoperate.</span></div>
      </section>

      <section className="story-section roadmap-story" id="roadmap" data-story-section>
        <div className="section-kicker"><span>04</span><p>Deliberate execution beats empty hype.</p></div>
        <div className="premium-heading roadmap-heading"><div><span className="eyebrow-premium"><Icon name="spark" /> Execution roadmap</span><h2>Built in phases.<br /><em>Designed to compound.</em></h2></div><GlassButton href="/roadmap">View full roadmap</GlassButton></div>
        <div className="roadmap-rail">
          <article className="phase-card complete"><span>PHASE 01</span><div className="phase-orb"><i /></div><h3>Foundation</h3><p>Flagship website, production foundation, analytics, and ecosystem positioning.</p><small>Complete</small></article>
          <article className="phase-card current"><span>PHASE 02</span><div className="phase-orb"><i /></div><h3>Expansion</h3><p>Premium discovery, product surfaces, community, and partner-ready storytelling.</p><small>Current</small></article>
          <article className="phase-card started"><span>PHASE 03</span><div className="phase-orb"><i /></div><h3>Integration</h3><p>Wallet authentication and the GWAP OS identity runtime are live; shared profiles and cross-product data continue rolling out.</p><small>Underway</small></article>
        </div>
        <Link className="latest-build-card" href={`/changelog#${latestBuildLogEntry.slug}`}>
          <span className="latest-build-signal" aria-hidden="true"><i /></span>
          <span className="latest-build-copy">
            <small>Latest build · {formatBuildLogDate(latestBuildLogEntry.releasedAt)}</small>
            <strong>{latestBuildLogEntry.title}</strong>
            <p>{latestBuildLogEntry.summary}</p>
          </span>
          <span className="latest-build-action">View build log <Icon name="arrow" /></span>
        </Link>
      </section>

      <section className="story-section community-story" id="community" data-story-section>
        <div className="community-glow" />
        <div className="community-panel">
          <span className="eyebrow-premium"><Icon name="spark" /> The network is growing</span>
          <h2>Come build with<br /><em>purpose.</em></h2>
          <p>Follow product releases, development progress, community updates, and the next chapter of the GWAP ecosystem.</p>
          <div className="hero-ctas"><GlassButton href="/community" primary>Join the community</GlassButton><GlassButton href="/contact">Partner with GWAP</GlassButton></div>
          <div className="social-row">{socialLinks.map((social) => <a href={social.href} target="_blank" rel="noreferrer" key={social.label}><span>{social.label}</span><Icon name="arrow" /></a>)}</div>
        </div>
      </section>

      <footer className="cinematic-footer">
        <div className="footer-lockup"><Image src="/logos/gwap-agent-clear.svg" alt="" width={42} height={42} /><span><strong>GWAP</strong><small>GRIND WITH A PURPOSE</small></span></div>
        <div className="footer-nav"><Link href="/ecosystem">Ecosystem</Link><Link href="/about">About</Link><Link href="/roadmap">Roadmap</Link><Link href="/changelog">Build Log</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></div>
        <small>© {new Date().getFullYear()} GWAP. The future rewards purpose.</small>
      </footer>
    </main>
  );
}
