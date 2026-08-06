"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import type { EcosystemProduct } from "../../lib/ecosystem";
import { getProfileCompletion } from "../lib/os-state";
import { useGwapOs } from "./os-provider";

export function DashboardView({ products }: { products: EcosystemProduct[] }) {
  const { state, recordLaunch, toggleFavorite } = useGwapOs();
  const profileCompletion = getProfileCompletion(state.profile);
  const liveProducts = products.filter((product) => product.status === "Live").length;

  const orderedProducts = useMemo(
    () =>
      [...products].sort((a, b) => {
        const aFavorite = state.favorites.includes(a.slug) ? 1 : 0;
        const bFavorite = state.favorites.includes(b.slug) ? 1 : 0;
        if (aFavorite !== bFavorite) return bFavorite - aFavorite;
        return a.name.localeCompare(b.name);
      }),
    [products, state.favorites],
  );

  const recentProducts = state.recent
    .map((recent) => ({
      recent,
      product: products.find((product) => product.slug === recent.slug),
    }))
    .filter((item): item is { recent: typeof item.recent; product: EcosystemProduct } =>
      Boolean(item.product),
    );

  return (
    <div className="os-page">
      <section className="os-page-heading">
        <div>
          <span className="os-kicker">GWAP OS / SECURE WORKSPACE</span>
          <h1>Your ecosystem. One command center.</h1>
          <p>
            Launch products, organize favorites, track recent activity, and prepare
            your unified GWAP identity from one secure account workspace.
          </p>
        </div>
        <Link className="os-primary-action" href="/launch">
          Open full launchpad <span aria-hidden="true">↗</span>
        </Link>
      </section>

      <section className="os-stat-grid" aria-label="Workspace summary">
        <article>
          <span>AVAILABLE NOW</span>
          <strong>{liveProducts}</strong>
          <small>Live ecosystem products</small>
        </article>
        <article>
          <span>FAVORITES</span>
          <strong>{state.favorites.length}</strong>
          <small>Synced to your account</small>
        </article>
        <article>
          <span>RECENT</span>
          <strong>{state.recent.length}</strong>
          <small>Product launches tracked</small>
        </article>
        <article>
          <span>PROFILE</span>
          <strong>{profileCompletion}%</strong>
          <small>Identity foundation complete</small>
        </article>
      </section>

      <section className="os-content-grid">
        <div className="os-panel os-app-panel">
          <div className="os-panel-heading">
            <div>
              <span>QUICK LAUNCH</span>
              <h2>Ecosystem applications</h2>
            </div>
            <small>Favorites appear first</small>
          </div>

          <div className="os-app-grid">
            {orderedProducts.map((product) => {
              const favorite = state.favorites.includes(product.slug);
              return (
                <article className={`os-app-card accent-${product.accent}`} key={product.slug}>
                  <div className="os-app-card-top">
                    <span className="os-app-icon">
                      <Image
                        src={product.logo}
                        alt={`${product.name} logo`}
                        width={66}
                        height={66}
                        sizes="66px"
                        unoptimized
                      />
                    </span>
                    <button
                      type="button"
                      aria-label={`${favorite ? "Remove" : "Add"} ${product.name} ${
                        favorite ? "from" : "to"
                      } favorites`}
                      aria-pressed={favorite}
                      onClick={() => toggleFavorite(product.slug)}
                    >
                      {favorite ? "★" : "☆"}
                    </button>
                  </div>
                  <div>
                    <span className={`os-product-status status-${product.status.toLowerCase().replaceAll(" ", "-")}`}>
                      {product.status}
                    </span>
                    <h3>{product.name}</h3>
                    <p>{product.summary}</p>
                  </div>
                  <div className="os-app-actions">
                    {product.externalUrl ? (
                      <a
                        href={product.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => recordLaunch(product.slug)}
                      >
                        Launch <span aria-hidden="true">↗</span>
                      </a>
                    ) : (
                      <span>Not available yet</span>
                    )}
                    <Link href={`/ecosystem/${product.slug}`}>Details</Link>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <aside className="os-side-stack">
          <section className="os-panel os-identity-panel">
            <div className="os-panel-heading">
              <div>
                <span>UNIFIED IDENTITY</span>
                <h2>Profile readiness</h2>
              </div>
              <strong>{profileCompletion}%</strong>
            </div>
            <div className="os-progress" aria-label={`${profileCompletion}% profile complete`}>
              <i style={{ width: `${profileCompletion}%` }} />
            </div>
            <p>
              Add a bio, verified wallet, website, and location to prepare the
              profile that can later connect to GNS.
            </p>
            <Link href="/app/profile">Complete profile</Link>
          </section>

          <section className="os-panel os-activity-panel">
            <div className="os-panel-heading">
              <div>
                <span>RECENT ACTIVITY</span>
                <h2>Last opened</h2>
              </div>
            </div>
            {recentProducts.length ? (
              <ol>
                {recentProducts.map(({ product, recent }) => (
                  <li key={product.slug}>
                    <Image
                      src={product.logo}
                      alt=""
                      width={34}
                      height={34}
                      unoptimized
                    />
                    <span>
                      <strong>{product.name}</strong>
                      <small>{new Date(recent.openedAt).toLocaleString()}</small>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="os-empty-state">
                <strong>No launches yet</strong>
                <p>Open a live product and it will appear here.</p>
              </div>
            )}
          </section>

          <section className="os-panel os-account-panel">
            <span>ACCOUNT MODE</span>
            <h2>Secure sync active</h2>
            <p>
              Profile, favorites, recent activity, and settings follow your verified
              account across devices.
            </p>
          </section>
        </aside>
      </section>
    </div>
  );
}
