"use client";

import { useEffect } from "react";
import { subscribeGwapTreeEnhancer } from "../lib/gwap-dom-observer";
import {
  getGwapInteractiveTarget,
  isGwapInteractiveDisabled,
  subscribeGwapClick,
  subscribeGwapPointerDown,
} from "../lib/gwap-interaction-events";

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

type InteractionPoint = {
  x: number;
  y: number;
};

type InteractionBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type PendingPointerUpdate = {
  target: Element;
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

function supportsSpaceActivation(element: HTMLElement) {
  return element.tagName === "BUTTON" || element.getAttribute("role") === "button";
}

function getBounds(element: HTMLElement): InteractionBounds {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
}

function getPointFromBounds(
  bounds: InteractionBounds,
  clientX?: number,
  clientY?: number,
): InteractionPoint {
  const x = clientX == null ? bounds.width / 2 : clientX - bounds.left;
  const y = clientY == null ? bounds.height / 2 : clientY - bounds.top;
  return {
    x: Math.max(0, Math.min(bounds.width, x)),
    y: Math.max(0, Math.min(bounds.height, y)),
  };
}

function getPoint(element: HTMLElement, clientX?: number, clientY?: number) {
  return getPointFromBounds(getBounds(element), clientX, clientY);
}

function setPointerVariables(element: HTMLElement, point: InteractionPoint) {
  element.style.setProperty("--gwap-pointer-x", `${point.x}px`);
  element.style.setProperty("--gwap-pointer-y", `${point.y}px`);
}

function getOrCreatePulse(element: HTMLElement) {
  const existing = Array.from(element.children).find((child) =>
    child.classList.contains("gwap-tap-pulse"),
  );
  if (existing instanceof HTMLElement) return existing;

  const pulse = document.createElement("span");
  pulse.className = "gwap-tap-pulse";
  pulse.setAttribute("aria-hidden", "true");
  element.appendChild(pulse);
  return pulse;
}

function triggerPulse(element: HTMLElement, point: InteractionPoint) {
  element.style.setProperty("--gwap-tap-x", `${point.x}px`);
  element.style.setProperty("--gwap-tap-y", `${point.y}px`);

  const pulse = getOrCreatePulse(element);
  pulse.dataset.gwapPulseCycle = pulse.dataset.gwapPulseCycle === "a" ? "b" : "a";
}

export function GwapInteractionLayer() {
  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const unsubscribeEnhancer = subscribeGwapTreeEnhancer(enhanceTree);

    const pressTimers = new Map<HTMLElement, number>();
    const launchTimers = new Map<HTMLElement, number>();
    const groupTimers = new Map<HTMLElement, number>();
    const reactiveBounds = new WeakMap<
      HTMLElement,
      { bounds: InteractionBounds; epoch: number }
    >();
    let geometryEpoch = 0;
    let pointerFrame = 0;
    let pendingPointerUpdate: PendingPointerUpdate | null = null;

    const invalidateReactiveBounds = () => {
      geometryEpoch += 1;
      pendingPointerUpdate = null;
    };

    const getReactivePoint = (
      element: HTMLElement,
      clientX: number,
      clientY: number,
    ) => {
      const cached = reactiveBounds.get(element);
      const bounds =
        cached?.epoch === geometryEpoch ? cached.bounds : getBounds(element);

      if (cached?.epoch !== geometryEpoch) {
        reactiveBounds.set(element, { bounds, epoch: geometryEpoch });
      }

      return getPointFromBounds(bounds, clientX, clientY);
    };

    const flushPointerUpdate = () => {
      const pending = pendingPointerUpdate;
      pendingPointerUpdate = null;
      pointerFrame = 0;
      if (!pending) return;

      const reactive = pending.target.closest<HTMLElement>(
        "[data-gwap-reactive='true']",
      );
      if (!reactive || !reactive.isConnected) return;

      const point = getReactivePoint(
        reactive,
        pending.clientX,
        pending.clientY,
      );
      setPointerVariables(reactive, point);
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

    const activate = (element: HTMLElement, point?: InteractionPoint) => {
      const existingTimer = pressTimers.get(element);
      if (existingTimer) window.clearTimeout(existingTimer);

      reactiveBounds.delete(element);
      element.classList.add("gwap-pressing");
      const timer = window.setTimeout(() => {
        element.classList.remove("gwap-pressing");
        reactiveBounds.delete(element);
        pressTimers.delete(element);
      }, 190);
      pressTimers.set(element, timer);

      if (!reduceMotion.matches && point) triggerPulse(element, point);
    };

    const onPointerDown = (event: PointerEvent, element: HTMLElement) => {
      if (event.button !== 0) return;

      const point = getPoint(element, event.clientX, event.clientY);
      setPointerVariables(element, point);
      activate(element, point);
    };

    const onPointerMove = (event: PointerEvent) => {
      const target = event.target;
      if (
        reduceMotion.matches ||
        event.pointerType === "touch" ||
        !(target instanceof Element)
      ) {
        return;
      }

      pendingPointerUpdate = {
        target,
        clientX: event.clientX,
        clientY: event.clientY,
      };
      if (!pointerFrame) pointerFrame = window.requestAnimationFrame(flushPointerUpdate);
    };

    const onClick = (event: MouseEvent, element: HTMLElement) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;

      // Product launch state only starts after a real click. This avoids false
      // activations when a touch gesture begins on a card but becomes a scroll.
      activateProduct(element);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;

      const element = getGwapInteractiveTarget(event.target);
      if (!element || isGwapInteractiveDisabled(element)) return;
      if (event.key === " " && !supportsSpaceActivation(element)) return;

      activate(element, reduceMotion.matches ? undefined : getPoint(element));
    };

    const unsubscribePointerDown = subscribeGwapPointerDown(onPointerDown);
    const unsubscribeClick = subscribeGwapClick(onClick);
    document.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("scroll", invalidateReactiveBounds, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", invalidateReactiveBounds, { passive: true });
    window.visualViewport?.addEventListener("resize", invalidateReactiveBounds, {
      passive: true,
    });
    window.visualViewport?.addEventListener("scroll", invalidateReactiveBounds, {
      passive: true,
    });
    document.addEventListener("keydown", onKeyDown, { capture: true });

    return () => {
      unsubscribeEnhancer();
      pressTimers.forEach((timer, element) => {
        window.clearTimeout(timer);
        element.classList.remove("gwap-pressing");
      });
      launchTimers.forEach((timer, element) => {
        window.clearTimeout(timer);
        element.classList.remove("gwap-product-activating");
      });
      groupTimers.forEach((timer, group) => {
        window.clearTimeout(timer);
        delete group.dataset.gwapActiveProduct;
      });
      document.querySelectorAll(".gwap-tap-pulse").forEach((pulse) => pulse.remove());
      pressTimers.clear();
      launchTimers.clear();
      groupTimers.clear();
      unsubscribePointerDown();
      unsubscribeClick();
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("scroll", invalidateReactiveBounds, { capture: true });
      window.removeEventListener("resize", invalidateReactiveBounds);
      window.visualViewport?.removeEventListener("resize", invalidateReactiveBounds);
      window.visualViewport?.removeEventListener("scroll", invalidateReactiveBounds);
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
      pendingPointerUpdate = null;
    };
  }, []);

  return null;
}
