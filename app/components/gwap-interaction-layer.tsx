"use client";

import { useEffect } from "react";
import { subscribeGwapTreeEnhancer } from "../lib/gwap-dom-observer";
import {
  getGwapInteractiveTarget,
  isGwapInteractiveDisabled,
  subscribeGwapPointerDown,
} from "../lib/gwap-interaction-events";

/*
 * Product cards intentionally do NOT participate in this global interaction
 * layer. On iOS Safari, combining custom pointer-down feedback, :hover state,
 * and link navigation can make the first tap act like hover acquisition. Keep
 * ecosystem cards as native anchors and reserve this layer for controls whose
 * activation does not navigate away immediately.
 */
const INTERACTIVE_SELECTOR = [
  ".glass-button",
  ".icon-button",
  ".nav-contact",
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
].join(",");

const DECORATIVE_GLYPH_SELECTOR = ".product-glyph";

type InteractionPoint = {
  x: number;
  y: number;
};

function enhanceElement(element: Element) {
  if (!(element instanceof HTMLElement)) return;

  if (element.matches(DECORATIVE_GLYPH_SELECTOR)) {
    element.setAttribute("aria-hidden", "true");
  }

  if (element.matches(INTERACTIVE_SELECTOR)) {
    element.dataset.gwapInteractive ||= "auto";
  }
}

function enhanceTree(root: ParentNode) {
  if (root instanceof Element) enhanceElement(root);
  root.querySelectorAll(INTERACTIVE_SELECTOR).forEach(enhanceElement);
  root.querySelectorAll(DECORATIVE_GLYPH_SELECTOR).forEach(enhanceElement);
}

function supportsSpaceActivation(element: HTMLElement) {
  return element.tagName === "BUTTON" || element.getAttribute("role") === "button";
}

function getPoint(element: HTMLElement, clientX?: number, clientY?: number): InteractionPoint {
  const rect = element.getBoundingClientRect();
  const x = clientX == null ? rect.width / 2 : clientX - rect.left;
  const y = clientY == null ? rect.height / 2 : clientY - rect.top;

  return {
    x: Math.max(0, Math.min(rect.width, x)),
    y: Math.max(0, Math.min(rect.height, y)),
  };
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

    const activate = (element: HTMLElement, point?: InteractionPoint) => {
      const existingTimer = pressTimers.get(element);
      if (existingTimer) window.clearTimeout(existingTimer);

      element.classList.add("gwap-pressing");
      const timer = window.setTimeout(() => {
        element.classList.remove("gwap-pressing");
        pressTimers.delete(element);
      }, 150);
      pressTimers.set(element, timer);

      if (!reduceMotion.matches && point) triggerPulse(element, point);
    };

    const onPointerDown = (event: PointerEvent, element: HTMLElement) => {
      if (event.button !== 0) return;
      const point = getPoint(element, event.clientX, event.clientY);
      setPointerVariables(element, point);
      activate(element, point);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;

      const element = getGwapInteractiveTarget(event.target);
      if (!element || isGwapInteractiveDisabled(element)) return;
      if (event.key === " " && !supportsSpaceActivation(element)) return;

      activate(element, reduceMotion.matches ? undefined : getPoint(element));
    };

    const unsubscribePointerDown = subscribeGwapPointerDown(onPointerDown);
    document.addEventListener("keydown", onKeyDown, { capture: true });

    return () => {
      unsubscribeEnhancer();
      pressTimers.forEach((timer, element) => {
        window.clearTimeout(timer);
        element.classList.remove("gwap-pressing");
      });
      document.querySelectorAll(".gwap-tap-pulse").forEach((pulse) => pulse.remove());
      pressTimers.clear();
      unsubscribePointerDown();
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, []);

  return null;
}
