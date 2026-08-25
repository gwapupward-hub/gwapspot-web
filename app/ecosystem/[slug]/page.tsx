import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowIcon,
  PageShell,
  SparkIcon,
} from "../../components/site-shell";
import {
  ecosystemProducts,
  productBySlug,
} from "../../lib/ecosystem";
import { createPageMetadata } from "../../lib/metadata";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return ecosystemProducts.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = productBySlug.get(slug);

  if (!product) {
    return {};
  }

  return createPageMetadata({
    title: product.name,
    description: product.summary,
    path: "/ecosystem/" + product.slug,
    socialTitle: product.name + " — GWAP Ecosystem",
    image: {
      url: product.logo,
      alt: product.name + " logo",
    },
  });
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = productBySlug.get(slug);

  if (!product) {
    notFound();
  }

  const productIndex = ecosystemProducts.findIndex(
    (item) => item.slug === product.slug,
  );
  const nextProduct =
    ecosystemProducts[(productIndex + 1) % ecosystemProducts.length];

  return (
    <PageShell>
      <section
        className={`product-hero accent-${product.accent}`}
        data-gwap-product-hero={product.slug}
      >
        <nav className="product-route-nav" aria-label="Product page navigation">
          <Link href="/" data-native-nav>← Home</Link>
          <Link href="/ecosystem" data-native-nav>Back to Ecosystem</Link>
        </nav>

        <div className="product-hero-meta">
          <Link href="/ecosystem" data-native-nav>GWAP ECOSYSTEM</Link>
          <span>/</span>
          <span>{product.name}</span>
        </div>
        <div className="product-hero-grid">
          <div>
            <div className={`product-hero-logo product-hero-logo--${product.slug}`}>
              <img
                src={product.logo}
                alt={`${product.name} logo`}
                width={180}
                height={180}
                loading="eager"
                decoding="async"
              />
            </div>
            <span className="product-eyebrow">{product.eyebrow}</span>
            <h1>{product.name}</h1>
            <p>{product.description}</p>
            <div className="inner-hero-actions">
              {product.internalUrl ? (
                <Link className="primary-button" href={product.internalUrl}>
                  {product.internalLabel ?? "Open product"} <ArrowIcon />
                </Link>
              ) : product.externalUrl ? (
                <a
                  className="primary-button"
                  href={product.externalUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {product.externalLabel ?? "Launch product"} <ArrowIcon />
                </a>
              ) : (
                <Link className="primary-button" href="/roadmap">
                  View development roadmap <ArrowIcon />
                </Link>
              )}
              <Link className="secondary-button" href="/ecosystem" data-native-nav>
                ← Back to Ecosystem
              </Link>
            </div>
          </div>
          <aside className="product-brief">
            <div>
              <span>STATUS</span>
              <strong>{product.status}</strong>
            </div>
            <div>
              <span>ROLE</span>
              <strong>{product.role}</strong>
            </div>
            <div>
              <span>PRIMARY AUDIENCE</span>
              <strong>{product.audience}</strong>
            </div>
          </aside>
        </div>
      </section>

      <section className="inner-section">
        <div className="product-columns">
          <div>
            <span className="eyebrow">
              <SparkIcon /> Current capabilities
            </span>
            <h2>What this layer is designed to do.</h2>
          </div>
          <ul className="capability-list">
            {product.capabilities.map((capability, index) => (
              <li key={capability}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {capability}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="inner-section">
        <div className="product-columns roadmap-columns">
          <div>
            <span className="eyebrow">
              <SparkIcon /> Product roadmap
            </span>
            <h2>The next deliberate improvements.</h2>
          </div>
          <ol className="roadmap-list">
            {product.roadmap.map((item, index) => (
              <li key={item}>
                <span>0{index + 1}</span>
                <div>
                  <small>ROADMAP ITEM</small>
                  <strong>{item}</strong>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="inner-section">
        <div className="cta-panel">
          <div>
            <span className="eyebrow">
              <SparkIcon /> Continue exploring
            </span>
            <h2>Next: {nextProduct.name}</h2>
            <p>{nextProduct.summary}</p>
          </div>
          <Link
            className="primary-button"
            href={`/ecosystem/${nextProduct.slug}`}
            data-native-product-link
            prefetch={false}
          >
            View {nextProduct.name} <ArrowIcon />
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
