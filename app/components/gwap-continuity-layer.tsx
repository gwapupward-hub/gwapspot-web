"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const CONTINUITY_KEY = "gwap-product-continuity-v1";
const CONTINUITY_MAX_AGE = 8_000;

const productSignals: Record<string, string> = {
  gns: "#13dd13",
  gwapscore: "#13dd13",
  "daily-ideas": "#13dd13",
  dimi: "#8d5cff",
  occo: "#8d5cff",
  "private-proof-vault": "#8d5cff",
  marketplace: "#ff852e",
  "money-neva-sleeps": "#ff852e",
};

const lensLabels: Record<string, string> = {
  identity: "IDENTITY LENS",
  trust: "TRUST LENS",
  commerce: "COMMERCE LENS",
  intelligence: "INTELLIGENCE LENS",
};

type ContinuitySource = "card" | "graph" | "sequence" | "link";

type ProductContinuity = {
  slug: string;
  at: number;
  source: ContinuitySource;
  lens?: string;
  originX: number;
  originY: number;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

function getProductSlugFromHref(element: HTMLElement) {
  const href = element.getAttribute("href");
  if (!href) return null;

  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    const match = url.pathname.match(/^\/ecosystem\/([^/?#]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function getCurrentProductSlug(pathname: string) {
  const match = pathname.match(/^\/ecosystem\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function isContinuitySource(value: string | undefined): value is ContinuitySource {
  return value === "card" || value === "graph" || value === "sequence" || value === "link";
}

function inferSource(element: HTMLElement): ContinuitySource {
  const explicit = element.dataset.gwapProductSource;
  if (isContinuitySource(explicit)) return explicit;
  if (element.closest(".gwap-graph-inspector")) return "graph";
  if (element.closest(".premium-product-card, .product-card")) return "card";
  if (element.closest(".cta-panel")) return "sequence";
  return "link";
}

function inferLens(element: HTMLElement, source: ContinuitySource) {
  const explicit = element.dataset.gwapProductLens;
  if (explicit && explicit !== "all") return explicit;
  if (source !== "graph") return undefined;

  const activeMode = document.querySelector<HTMLElement>(".gwap-graph-stage[data-graph-mode]")?.dataset.graphMode;
  return activeMode && activeMode !== "all" ? activeMode : undefined;
}

function writeContinuity(element: HTMLElement, slug: string) {
  const rect = element.getBoundingClientRect();
  const viewportWidth = Math.max(window.innerWidth, 1);
  const viewportHeight = Math.max(window.innerHeight, 1);
  const source = inferSource(element);
  const continuity: ProductContinuity = {
    slug,
    at: Date.now(),
    source,
    lens: inferLens(element, source),
    originX: clamp((rect.left + rect.width / 2) / viewportWidth, 0, 1),
    originY: clamp((rect.top + rect.height / 2) / viewportHeight, 0, 1),
  };

  try {
    window.sessionStorage.setItem(CONTINUITY_KEY, JSON.stringify(continuity));
  } catch {
    // Storage can be unavailable in privacy-restricted browsing contexts.
  }
}

function clearContinuity() {
  try {
    window.sessionStorage.removeItem(CONTINUITY_KEY);
  } catch {
    // No-op when storage is unavailable.
  }
}

function readContinuity() {
  try {
    const raw = window.sessionStorage.getItem(CONTINUITY_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<ProductContinuity>;
    if (
      typeof parsed.slug !== "string" ||
      typeof parsed.at !== "number" ||
      !isContinuitySource(parsed.source) ||
      typeof parsed.originX !== "number" ||
      typeof parsed.originY !== "number" ||
      parsed.originX < 0 ||
      parsed.originX > 1 ||
      parsed.originY < 0 ||
      parsed.originY > 1
    ) {
      clearContinuity();
      return null;
    }

    if (Date.now() - parsed.at > CONTINUITY_MAX_AGE) {
      clearContinuity();
      return null;
    }

    return parsed as ProductContinuity;
  } catch {
    clearContinuity();
    return null;
  }
}

function getHandoffLabel(continuity: ProductContinuity) {
  if (continuity.lens && lensLabels[continuity.lens]) return lensLabels[continuity.lens];
  if (continuity.source === "graph") return "RELATIONSHIP MAP";
  if (continuity.source === "sequence") return "NEXT MODULE";
  if (continuity.source === "card") return "PRODUCT SIGNAL";
  return "GWAP ECOSYSTEM";
}

function createRelay(hero: HTMLElement, continuity: ProductContinuity) {
  const viewportWidth = Math.max(window.innerWidth, 1);
  const viewportHeight = Math.max(window.innerHeight, 1);
  const originX = continuity.originX * viewportWidth;
  const originY = continuity.originY * viewportHeight;
  const receiver = hero.querySelector<HTMLElement>(".product-hero-logo") ?? hero;
  const receiverRect = receiver.getBoundingClientRect();
  const targetX = receiverRect.left + receiverRect.width / 2;
  const targetY = receiverRect.top + receiverRect.height / 2;
  const deltaX = targetX - originX;
  const deltaY = targetY - originY;
  const distance = Math.max(1, Math.hypot(deltaX, deltaY));
  const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);

  hero.style.setProperty("--gwap-continuity-arrival-x", `${clamp(-deltaX * 0.085, -54, 54).toFixed(1)}px`);
  hero.style.setProperty("--gwap-continuity-arrival-y", `${clamp(-deltaY * 0.07, -38, 38).toFixed(1)}px`);

  const relay = document.createElement("div");
  relay.className = "gwap-continuity-relay";
  relay.setAttribute("aria-hidden", "true");
  relay.dataset.gwapContinuitySource = continuity.source;
  if (continuity.lens) relay.dataset.gwapContinuityLens = continuity.lens;
  relay.style.setProperty("--gwap-relay-origin-x", `${originX.toFixed(1)}px`);
  relay.style.setProperty("--gwap-relay-origin-y", `${originY.toFixed(1)}px`);
  relay.style.setProperty("--gwap-relay-dx", `${deltaX.toFixed(1)}px`);
  relay.style.setProperty("--gwap-relay-dy", `${deltaY.toFixed(1)}px`);
  relay.style.setProperty("--gwap-relay-distance", `${distance.toFixed(1)}px`);
  relay.style.setProperty("--gwap-relay-angle", `${angle.toFixed(2)}deg`);
  relay.style.setProperty("--gwap-continuity-signal", productSignals[continuity.slug] ?? "#13dd13");

  const origin = document.createElement("span");
  const line = document.createElement("i");
  const target = document.createElement("b");
  const label = document.createElement("em");
  label.textContent = getHandoffLabel(continuity);
  relay.append(origin, line, target, label);
  document.body.appendChild(relay);

  return relay;
}

export function GwapContinuityLayer() {
  const pathname = usePathname();

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (!(event.target instanceof Element)) return;

      const link = event.target.closest<HTMLElement>("a[href]");
      if (!link || link.getAttribute("target") === "_blank") return;
      const slug = link.dataset.gwapProduct || getProductSlugFromHref(link);
      if (!slug) return;

      writeContinuity(link, slug);
    };

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  useEffect(() => {
    const slug = getCurrentProductSlug(pathname);
    if (!slug) return;

    let relay: HTMLElement | null = null;
    let removeTimer = 0;
    const frame = window.requestAnimationFrame(() => {
      const continuity = readContinuity();
      if (!continuity) return;
      if (continuity.slug !== slug) {
        clearContinuity();
        return;
      }

      const hero = document.querySelector<HTMLElement>(`.product-hero[data-gwap-product-hero="${slug}"], .product-hero`);
      if (!hero) {
        clearContinuity();
        return;
      }

      hero.dataset.gwapContinuitySource = continuity.source;
      if (continuity.lens) hero.dataset.gwapContinuityLens = continuity.lens;

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduceMotion) {
        relay = createRelay(hero, continuity);
        hero.classList.add("gwap-continuity-arrival");
        removeTimer = window.setTimeout(() => relay?.remove(), 1_150);
      }

      window.dispatchEvent(
        new CustomEvent("gwap:producthandoff", {
          detail: { slug, source: continuity.source, lens: continuity.lens ?? null },
        }),
      );
      clearContinuity();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (removeTimer) window.clearTimeout(removeTimer);
      relay?.remove();
    };
  }, [pathname]);

  return null;
}
