"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ecosystemProducts } from "../lib/ecosystem";

type IconName = "arrow" | "search" | "menu" | "close";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    search: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
  };

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

export function CinematicNavigation() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const searchDialogRef = useRef<HTMLDivElement>(null);

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
    <>
      <header className="cinematic-nav">
        <Link className="cinematic-brand" href="#top" aria-label="GWAPSpot home">
          <span className="cinematic-brand-mark">
            <Image
              src="/logos/gwap-agent-clear.svg"
              alt=""
              width={44}
              height={44}
              priority
            />
          </span>
          <span>
            <strong>GWAP</strong>
            <small>SPOT</small>
          </span>
        </Link>

        <nav
          className={`cinematic-links${menuOpen ? " is-open" : ""}`}
          aria-label="Primary navigation"
        >
          <Link
            className="cinematic-os-menu-link"
            href="/app"
            onClick={() => setMenuOpen(false)}
          >
            Open GWAP OS <Icon name="arrow" />
          </Link>
          <Link href="#overview" onClick={() => setMenuOpen(false)}>
            Start Here
          </Link>
          <Link href="#ecosystem" onClick={() => setMenuOpen(false)}>
            Ecosystem
          </Link>
          <Link href="#trust" onClick={() => setMenuOpen(false)}>
            Infrastructure
          </Link>
          <Link href="#roadmap" onClick={() => setMenuOpen(false)}>
            Roadmap
          </Link>
          <Link href="/community" onClick={() => setMenuOpen(false)}>
            Community
          </Link>
        </nav>

        <div className="cinematic-nav-actions">
          <button
            ref={searchButtonRef}
            className="icon-button"
            type="button"
            aria-label="Search GWAP products"
            onClick={() => setSearchOpen(true)}
          >
            <Icon name="search" />
          </button>
          <Link className="nav-contact nav-os-entry" href="/app">
            Open GWAP OS <Icon name="arrow" />
          </Link>
          <button
            className="icon-button menu-button"
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((current) => !current)}
          >
            <Icon name={menuOpen ? "close" : "menu"} />
          </button>
        </div>
      </header>

      {searchOpen ? (
        <div
          ref={searchDialogRef}
          className="search-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Search the GWAP ecosystem"
          onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
            if (event.target === event.currentTarget) setSearchOpen(false);
          }}
        >
          <div className="search-panel">
            <div className="search-field">
              <Icon name="search" />
              <input
                ref={searchInputRef}
                aria-label="Search GWAP products"
                value={query}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setQuery(event.target.value)
                }
                placeholder="Search GNS, GwapScore, DIMI…"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                aria-label="Close search"
              >
                <Icon name="close" />
              </button>
            </div>
            <div className="search-results">
              {searchResults.map((product) => (
                <Link
                  href={`/ecosystem/${product.slug}`}
                  key={product.slug}
                  onClick={() => setSearchOpen(false)}
                >
                  <span>
                    <small>{product.eyebrow}</small>
                    <strong>{product.name}</strong>
                  </span>
                  <Icon name="arrow" />
                </Link>
              ))}
              {searchResults.length === 0 ? (
                <p>No products match that search.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
