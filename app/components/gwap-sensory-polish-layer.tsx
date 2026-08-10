"use client";

import { useEffect } from "react";

const TAP_MAX_DISTANCE = 10;
const TAP_MAX_DURATION_MS = 650;
const HAPTIC_THROTTLE_MS = 90;

type TapCandidate = {
  element: HTMLElement;
  x: number;
  y: number;
  at: number;
  pointerType: string;
};

function isDisabled(element: HTMLElement) {
  return element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true";
}

function getInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>("[data-gwap-interactive]");
}

function getFeedbackTier(element: HTMLElement) {
  if (
    element.matches(
      ".premium-product-card, .product-card, .primary-button, .premium-splash__skip, .gwap-graph-node",
    )
  ) {
    return "primary";
  }

  if (
    element.matches(
      ".gwap-graph-mode-controls button, .gwap-graph-relations button, .secondary-button, .story-chapters a, .cinematic-links a",
    )
  ) {
    return "system";
  }

  return "utility";
}

function getHapticDuration(tier: string) {
  if (tier === "primary") return 8;
  if (tier === "system") return 6;
  return 4;
}

export function GwapSensoryPolishLayer() {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const tapCandidates = new Map<number, TapCandidate>();
    const feedbackTimers = new WeakMap<HTMLElement, number>();
    let lastHapticAt = 0;

    const confirmFeedback = (element: HTMLElement, allowHaptic: boolean) => {
      const tier = getFeedbackTier(element);
      element.dataset.gwapFeedbackTier = tier;

      const existingTimer = feedbackTimers.get(element);
      if (existingTimer) window.clearTimeout(existingTimer);

      if (!reducedMotion.matches) {
        element.classList.remove("gwap-feedback-confirmed");
        void element.offsetWidth;
        element.classList.add("gwap-feedback-confirmed");
        const timer = window.setTimeout(() => {
          element.classList.remove("gwap-feedback-confirmed");
          feedbackTimers.delete(element);
        }, 240);
        feedbackTimers.set(element, timer);
      }

      if (
        allowHaptic &&
        !reducedMotion.matches &&
        !document.hidden &&
        typeof navigator.vibrate === "function" &&
        Date.now() - lastHapticAt >= HAPTIC_THROTTLE_MS
      ) {
        lastHapticAt = Date.now();
        navigator.vibrate(getHapticDuration(tier));
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || (event.pointerType !== "touch" && event.pointerType !== "pen")) return;
      const element = getInteractiveTarget(event.target);
      if (!element || isDisabled(element)) return;

      tapCandidates.set(event.pointerId, {
        element,
        x: event.clientX,
        y: event.clientY,
        at: performance.now(),
        pointerType: event.pointerType,
      });
    };

    const onPointerUp = (event: PointerEvent) => {
      const candidate = tapCandidates.get(event.pointerId);
      tapCandidates.delete(event.pointerId);
      if (!candidate) return;

      const distance = Math.hypot(event.clientX - candidate.x, event.clientY - candidate.y);
      const duration = performance.now() - candidate.at;
      const releasedTarget = getInteractiveTarget(event.target);

      if (
        distance > TAP_MAX_DISTANCE ||
        duration > TAP_MAX_DURATION_MS ||
        releasedTarget !== candidate.element ||
        isDisabled(candidate.element)
      ) {
        return;
      }

      confirmFeedback(candidate.element, candidate.pointerType === "touch" || candidate.pointerType === "pen");
    };

    const onPointerCancel = (event: PointerEvent) => {
      tapCandidates.delete(event.pointerId);
    };

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const element = getInteractiveTarget(event.target);
      if (!element || isDisabled(element)) return;

      // Pointer taps are confirmed on pointerup so haptics can be gated against scroll gestures.
      // Click still supplies the same visual confirmation for mouse and keyboard activation.
      if (event.detail === 0 || window.matchMedia("(pointer: fine)").matches) {
        confirmFeedback(element, false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    document.addEventListener("pointerup", onPointerUp, { capture: true });
    document.addEventListener("pointercancel", onPointerCancel, { capture: true });
    document.addEventListener("click", onClick, { capture: true });

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
      document.removeEventListener("pointerup", onPointerUp, { capture: true });
      document.removeEventListener("pointercancel", onPointerCancel, { capture: true });
      document.removeEventListener("click", onClick, { capture: true });
    };
  }, []);

  return null;
}
