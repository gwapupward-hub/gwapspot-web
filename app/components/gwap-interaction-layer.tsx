"use client";

import { useEffect } from "react";

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

function enhanceElement(element: Element) {
  if (!(element instanceof HTMLElement)) return;

  if (element.matches(INTERACTIVE_SELECTOR)) {
    element.dataset.gwapInteractive ||= "auto";
  }

  if (element.matches(REACTIVE_SELECTOR)) {
    element.dataset.gwapReactive ||= "true";
  }
}

function enhanceTree(root: ParentNode) {
  if (root instanceof Element) enhanceElement(root);
  root.querySelectorAll(INTERACTIVE_SELECTOR).forEach(enhanceElement);
  root.querySelectorAll(REACTIVE_SELECTOR).forEach(enhanceElement);
}

function getInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>("[data-gwap-interactive]");
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
    enhanceTree(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) enhanceTree(node);
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const pressTimers = new WeakMap<HTMLElement, number>();

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
      const element = getInteractiveTarget(event.target);
      if (!element || element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") return;
      setPointerVariables(element, event.clientX, event.clientY);
      activate(element, event.clientX, event.clientY);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (reduceMotion.matches || !(event.target instanceof Element)) return;
      const reactive = event.target.closest<HTMLElement>("[data-gwap-reactive='true']");
      if (!reactive) return;
      setPointerVariables(reactive, event.clientX, event.clientY);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || (event.key !== "Enter" && event.key !== " ")) return;
      const element = getInteractiveTarget(event.target);
      if (!element || element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") return;
      activate(element);
    };

    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    document.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("keydown", onKeyDown, { capture: true });

    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, []);

  return null;
}
