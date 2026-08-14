"use client";

import { useEffect } from "react";
import { subscribeGwapTreeEnhancer } from "../lib/gwap-dom-observer";

const INTERACTIVE_SELECTOR = [
  ".glass-button",
  ".icon-button",
  ".nav-contact",
  ".premium-product-card",
  ".product-card",
  ".hero-utility-tabs button",
  ".hero-utility-form button",
  ".hero-utility-result-actions a",
  ".hero-utility-result-actions button",
  ".social-row a",
  ".latest-build-card",
  ".emblem-core-link",
  ".story-chapters a",
  ".cinematic-links a",
  ".footer-nav a",
  ".header-cta",
  ".primary-button",
  ".secondary-button",
  ".product-link",
].join(",");

const REACTIVE_SELECTOR = ".premium-product-card";
const DECORATIVE_GLYPH_SELECTOR = ".product-glyph";
const PRODUCT_TRANSITION_KEY = "gwap-product-transition-v1";
const PRODUCT_TRANSITION_MAX_AGE = 8_000;

type ProductTransition = {
  slug: string;
  at: number;
};

type PendingPointerUpdate = {
  element: HTMLElement;
  clientX: number;
  clientY: number;
};

function getProductSlugFromHref(element: HTMLElement) {
  const href = element.getAttribute("href");
  const match = href?.match(/^\/ecosystem\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function getProductSlug(element: HTMLElement) {
  return element.dataset.gwapProduct || getProductSlugFromHref(element);
}

function writeProductTransition(slug: string) {
  try {
    const transition: ProductTransition = { slug, at: Date.now() };
    window.sessionStorage.setItem(PRODUCT_TRANSITION_KEY, JSON.stringify(transition));
  } catch {
    // Storage can be unavailable in privacy-restricted browsing contexts.
  }
}

function clearProductTransition() {
  try {
    window.sessionStorage.removeItem(PRODUCT_TRANSITION_KEY);
  } catch {
    // No-op when storage is unavailable.
  }
}

function readProductTransition() {
  try {
    const raw = window.sessionStorage.getItem(PRODUCT_TRANSITION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<ProductTransition>;
    if (typeof parsed.slug !== "string" || typeof parsed.at !== "number") {
      clearProductTransition();
      return null;
    }

    if (Date.now() - parsed.at > PRODUCT_TRANSITION_MAX_AGE) {
      clearProductTransition();
      return null;
    }

    return parsed as ProductTransition;
  } catch {
    clearProductTransition();
    return null;
  }
}

function getCurrentProductSlug() {
  const match = window.location.pathname.match(/^\/ecosystem\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function enhanceProductHero(root: ParentNode) {
  const slug = getCurrentProductSlug();
  if (!slug) return;

  const hero =
    root instanceof HTMLElement && root.matches(".product-hero")
      ? root
      : root.querySelector<HTMLElement>(".product-hero");

  if (!hero) return;

  hero.dataset.gwapProductHero ||= slug;
  if (hero.dataset.gwapArrivalSeen === "true") return;

  const transition = readProductTransition();
  if (!transition) return;

  if (transition.slug !== slug) {
    clearProductTransition();
    return;
  }

  hero.dataset.gwapArrivalSeen = "true";
  window.requestAnimationFrame(() => hero.classList.add("gwap-product-arrival"));
  clearProductTransition();
}

function enhanceElement(element: Element) {
  if (!(element instanceof HTMLElement)) return;

  if (element.matches(DECORATIVE_GLYPH_SELECTOR)) {
    element.setAttribute("aria-hidden", "true");
  }

  if (element.matches(INTERACTIVE_SELECTOR)) {
    element.dataset.gwapInteractive ||= "auto";
  }

  if (element.matches(REACTIVE_SELECTOR)) {
    element.dataset.gwapReactive ||= "true";
    const slug = getProductSlugFromHref(element);
    if (slug) element.dataset.gwapProduct ||= slug;
  }
}

function enhanceTree(root: ParentNode) {
  if (root instanceof Element) enhanceElement(root);
  root.querySelectorAll(INTERACTIVE_SELECTOR).forEach(enhanceElement);
  root.querySelectorAll(REACTIVE_SELECTOR).forEach(enhanceElement);
  root.querySelectorAll(DECORATIVE_GLYPH_SELECTOR).forEach(enhanceElement);
  enhanceProductHero(root);
}

function getInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>("[data-gwap-interactive]");
}

function isDisabled(element: HTMLElement) {
  return element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true";
}

function supportsSpaceActivation(element: HTMLElement) {
  return element.tagName === "BUTTON" || element.getAttribute("role") === "button";
}

function getPoint(element: HTMLElement, clientX?: number, clientY?: number) {
  const rect = element.getBoundingClientRect();
  const x = clientX == null ? rect.width / 2 : clientX - rect.left;
  const y = clientY == null ? rect.height / 2 : clientY - rect.top;
  return {
    x: Math.max(0, Math.min(rect.width, x)),
    y: Math.max(0, Math.min(rect.height, y)),
  };
}

function setPointerVariables(element: HTMLElement, clientX: number, clientY: number) {
  const { x, y } = getPoint(element, clientX, clientY);
  element.style.setProperty("--gwap-pointer-x", `${x}px`);
  element.style.setProperty("--gwap-pointer-y", `${y}px`);
}

function createPulse(element: HTMLElement, clientX?: number, clientY?: number) {
  const { x, y } = getPoint(element, clientX, clientY);
  element.style.setProperty("--gwap-tap-x", `${x}px`);
  element.style.setProperty("--gwap-tap-y", `${y}px`);

  const pulse = document.createElement("span");
  pulse.className = "gwap-tap-pulse";
  pulse.setAttribute("aria-hidden", "true");
  pulse.style.left = `${x}px`;
  pulse.style.top = `${y}px`;
  element.appendChild(pulse);

  const removePulse = () => pulse.remove();
  pulse.addEventListener("animationend", removePulse, { once: true });
  window.setTimeout(removePulse, 900);
}

export function GwapInteractionLayer() {
  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const unsubscribeEnhancer = subscribeGwapTreeEnhancer(enhanceTree);

    const pressTimers = new WeakMap<HTMLElement, number>();
    const launchTimers = new WeakMap<HTMLElement, number>();
    const groupTimers = new WeakMap<HTMLElement, number>();
    let pointerFrame = 0;
    let pendingPointerUpdate: PendingPointerUpdate | null = null;

    const flushPointerUpdate = () => {
      const pending = pendingPointerUpdate;
      pendingPointerUpdate = null;
      pointerFrame = 0;
      if (!pending || !pending.element.isConnected) return;
      setPointerVariables(pending.element, pending.clientX, pending.clientY);
    };

    const activateProduct = (element: HTMLElement) => {
      const slug = getProductSlug(element);
      if (!slug) return;

      writeProductTransition(slug);
      element.classList.add("gwap-product-activating");

      const existingLaunchTimer = launchTimers.get(element);
      if (existingLaunchTimer) window.clearTimeout(existingLaunchTimer);
      const launchTimer = window.setTimeout(() => {
        element.classList.remove("gwap-product-activating");
        launchTimers.delete(element);
      }, 720);
      launchTimers.set(element, launchTimer);

      const group = element.closest<HTMLElement>(".ecosystem-group");
      if (!group) return;

      group.dataset.gwapActiveProduct = slug;
      const existingGroupTimer = groupTimers.get(group);
      if (existingGroupTimer) window.clearTimeout(existingGroupTimer);
      const groupTimer = window.setTimeout(() => {
        delete group.dataset.gwapActiveProduct;
        groupTimers.delete(group);
      }, 760);
      groupTimers.set(group, groupTimer);
    };

    const activate = (
      element: HTMLElement,
      clientX?: number,
      clientY?: number,
    ) => {
      const existingTimer = pressTimers.get(element);
      if (existingTimer) window.clearTimeout(existingTimer);

      element.classList.add("gwap-pressing");
      const timer = window.setTimeout(() => {
        element.classList.remove("gwap-pressing");
        pressTimers.delete(element);
      }, 190);
      pressTimers.set(element, timer);

      if (!reduceMotion.matches) createPulse(element, clientX, clientY);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;

      const element = getInteractiveTarget(event.target);
      if (!element || isDisabled(element)) return;

      setPointerVariables(element, event.clientX, event.clientY);
      activate(element, event.clientX, event.clientY);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (reduceMotion.matches || !(event.target instanceof Element)) return;
      const reactive = event.target.closest<HTMLElement>("[data-gwap-reactive='true']");
      if (!reactive) return;

      pendingPointerUpdate = {
        element: reactive,
        clientX: event.clientX,
        clientY: event.clientY,
      };
      if (!pointerFrame) pointerFrame = window.requestAnimationFrame(flushPointerUpdate);
    };

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;

      const element = getInteractiveTarget(event.target);
      if (!element || isDisabled(element)) return;

      // Product launch state only starts after a real click. This avoids false
      // activations when a touch gesture begins on a card but becomes a scroll.
      activateProduct(element);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;

      const element = getInteractiveTarget(event.target);
      if (!element || isDisabled(element)) return;
      if (event.key === " " && !supportsSpaceActivation(element)) return;

      activate(element);
    };

    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    document.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("click", onClick, { capture: true });
    document.addEventListener("keydown", onKeyDown, { capture: true });

    return () => {
      unsubscribeEnhancer();
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
      pendingPointerUpdate = null;
    };
  }, []);

  return null;
}
