import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { EcosystemProduct } from "../lib/ecosystem";
import { socialLinks } from "../lib/ecosystem";

export function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
      <path
        d="M4 10h11M11 5l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SparkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2l1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/" aria-label="GWAP home">
        <span className="brand-mark">
          <Image src="/logos/gwap-agent.png" alt="" width={40} height={40} priority />
        </span>
        <span className="brand-copy">
          <strong>GWAP</strong>
          <small>Grind With A Purpose</small>
        </span>
      </Link>

      <nav className="desktop-nav" aria-label="Primary navigation">
        <Link href="/launch">Launch</Link>
        <Link href="/ecosystem">Ecosystem</Link>
        <Link href="/about">About</Link>
        <Link href="/roadmap">Roadmap</Link>
        <Link href="/community">Community</Link>
        <Link href="/contact">Contact</Link>
      </nav>

      <Link className="header-cta" href="/app">
        GWAP OS <ArrowIcon />
      </Link>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer expanded-footer">
      <div className="footer-brand">
        <Image src="/logos/gwap-agent.png" alt="" width={34} height={34} />
        <div>
          <strong>GWAP</strong>
          <span>Grind With A Purpose</span>
        </div>
      </div>

      <p>Building connected digital infrastructure with purpose.</p>

      <div className="footer-links">
        <Link href="/app">GWAP OS</Link>
        <Link href="/launch">Launchpad</Link>
        <Link href="/ecosystem">Ecosystem</Link>
        <Link href="/about">About</Link>
        <Link href="/roadmap">Roadmap</Link>
        <Link href="/contact">Contact</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </div>

      <small>© {new Date().getFullYear()} GWAP. All rights reserved.</small>
    </footer>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <main className="inner-main">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <SiteHeader />
      {children}
      <SiteFooter />
    </main>
  );
}

type PageHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
};

export function PageHero({ eyebrow, title, description, children }: PageHeroProps) {
  return (
    <section className="inner-hero">
      <span className="eyebrow">
        <SparkIcon /> {eyebrow}
      </span>
      <h1>{title}</h1>
      <p>{description}</p>
      {children ? <div className="inner-hero-actions">{children}</div> : null}
    </section>
  );
}

export function ProductCard({
  product,
  index,
}: {
  product: EcosystemProduct;
  index: number;
}) {
  return (
    <Link
      className={`product-card product-card--${product.slug} accent-${product.accent}`}
      href={`/ecosystem/${product.slug}`}
    >
      <div className="product-card-top">
        <span className="product-number">{String(index + 1).padStart(2, "0")}</span>
        <span
          className={`status status-${product.status.toLowerCase().replaceAll(" ", "-")}`}
        >
          {product.status}
        </span>
      </div>
      <div className="product-logo-wrap">
        <Image
          src={product.logo}
          alt={`${product.name} logo`}
          width={128}
          height={128}
          sizes="128px"
          unoptimized
        />
      </div>
      <div>
        <span className="product-eyebrow">{product.eyebrow}</span>
        <h3>{product.name}</h3>
        <p>{product.summary}</p>
      </div>
      <span className="product-link">
        View product <ArrowIcon />
      </span>
    </Link>
  );
}

export function SocialGrid() {
  return (
    <div className="social-grid">
      {socialLinks.map((social) => (
        <a href={social.href} target="_blank" rel="noreferrer" key={social.label}>
          <span>
            <strong>{social.label}</strong>
            <small>{social.description}</small>
          </span>
          <ArrowIcon />
        </a>
      ))}
    </div>
  );
}
