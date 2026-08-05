"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { EcosystemProduct, ProductStatus } from "../lib/ecosystem";
import { ArrowIcon } from "../components/site-shell";

type Filter = "All" | ProductStatus;

const filters: Filter[] = ["All", "Live", "Beta", "In Development", "Planned"];

export default function Launchpad({ products }: { products: EcosystemProduct[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return products.filter((product) => {
      const matchesFilter = filter === "All" || product.status === filter;
      const searchable = [
        product.name,
        product.eyebrow,
        product.summary,
        product.role,
        product.audience,
      ]
        .join(" ")
        .toLowerCase();

      return matchesFilter && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [filter, products, query]);

  return (
    <div className="launchpad">
      <div className="launch-controls">
        <label className="launch-search">
          <span>Search the ecosystem</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Identity, music, AI, commerce..."
          />
        </label>

        <div className="launch-filters" aria-label="Filter products by status">
          {filters.map((item) => (
            <button
              key={item}
              type="button"
              className={item === filter ? "active" : undefined}
              onClick={() => setFilter(item)}
              aria-pressed={item === filter}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="launch-results-meta">
        <span>{String(filteredProducts.length).padStart(2, "0")} products</span>
        <small>
          {filter === "All" ? "Every ecosystem layer" : `${filter} products`}
        </small>
      </div>

      {filteredProducts.length > 0 ? (
        <div className="launch-grid">
          {filteredProducts.map((product, index) => (
            <article className={`launch-card accent-${product.accent}`} key={product.slug}>
              <div className="launch-card-top">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <small>{product.status}</small>
              </div>

              <div>
                <p>{product.eyebrow}</p>
                <h2>{product.name}</h2>
                <strong>{product.role}</strong>
                <span>{product.summary}</span>
              </div>

              <div className="launch-card-actions">
                <Link href={`/ecosystem/${product.slug}`}>
                  Product details <ArrowIcon />
                </Link>
                {product.externalUrl ? (
                  <a href={product.externalUrl} target="_blank" rel="noreferrer">
                    {product.externalLabel ?? "Launch product"} <ArrowIcon />
                  </a>
                ) : (
                  <span>Not publicly available yet</span>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="launch-empty">
          <h2>No products match that search.</h2>
          <p>Clear the search or choose a different status filter.</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setFilter("All");
            }}
          >
            Reset launchpad
          </button>
        </div>
      )}
    </div>
  );
}
