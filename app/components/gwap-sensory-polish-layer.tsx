"use client";

import { useEffect } from "react";
import { subscribeGwapTreeEnhancer } from "../lib/gwap-dom-observer";
import {
  getGwapInteractiveTarget,
  isGwapInteractiveDisabled,
  subscribeGwapClick,
  subscribeGwapPointerDown,
} from "../lib/gwap-interaction-events";

const TAP_MAX_DISTANCE = 10;
const TAP_MAX_DURATION_MS = 650;
const HAPTIC_THROTTLE_MS = 90;
const SENSORY_TARGET_SELECTOR = [
  ".premium-splash__skip",
  ".gwap-graph-mode-controls button",
  ".gwap-graph-node",
  ".gwap-graph-relations button",
  ".gwap-graph-inspector-actions a",
].join(",");

type TapCandidate = {
  element: HTMLElement;
  x: number;
  y: number;
  at: number;
  pointerType: string;
};

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

function enhanceElement(element: Element) {
  if (!(element instanceof HTMLElement) || !element.matches(SENSORY_TARGET_SELECTOR)) return;
  element.dataset.gwapInteractive ||= "sensory";
  element.dataset.gwapFeedbackTier ||= getFeedbackTier(element);
}

function enhanceTree(root: ParentNode) {
  if (root instanceof Element) enhanceElement(root);
  root.querySelectorAll(SENSORY_TARGET_SELECTOR).forEach(enhanceElement);
}

function getHapticDuration(tier: string) {
  if (tier === "primary") return 8;
  if (tier === "system") return 6;
  return 4;
}

export function GwapSensoryPolishLayer() {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(pointer: fine)");
    const tapCandidates = new Map<number, TapCandidate>();
    const feedbackTimers = new Map<HTMLElement, number>();
    let lastHapticAt = 0;

    const unsubscribeEnhancer = subscribeGwapTreeEnhancer(enhanceTree);

    const confirmFeedback = (element: HTMLElement, allowHaptic: boolean) => {
      const tier = element.dataset.gwapFeedbackTier || getFeedbackTier(element);
      element.dataset.gwapFeedbackTier = tier;

      const existingTimer = feedbackTimers.get(element);
      if (existingTimer) window.clearTimeout(existingTimer);

      if (!reducedMotion.matches) {
        // Alternating animation names restarts the feedback without forcing layout.
        element.dataset.gwapFeedbackCycle =
          element.dataset.gwapFeedbackCycle === "a" ? "b" : "a";
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

    const onPointerDown = (event: PointerEvent, element: HTMLElement) => {
      if (event.button !== 0 || (event.pointerType !== "touch" && event.pointerType !== "pen")) return;

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
      const releasedTarget = getGwapInteractiveTarget(event.target);

      if (
        distance > TAP_MAX_DISTANCE ||
        duration > TAP_MAX_DURATION_MS ||
        releasedTarget !== candidate.element ||
        isGwapInteractiveDisabled(candidate.element)
      ) {
        return;
      }

      confirmFeedback(candidate.element, candidate.pointerType === "touch" || candidate.pointerType === "pen");
    };

    const onPointerCancel = (event: PointerEvent) => {
      tapCandidates.delete(event.pointerId);
    };

    const onClick = (event: MouseEvent, element: HTMLElement) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;

      // Pointer taps are confirmed on pointerup so haptics can be gated against scroll gestures.
      // Click still supplies the same visual confirmation for mouse and keyboard activation.
      if (event.detail === 0 || finePointer.matches) {
        confirmFeedback(element, false);
      }
    };

    const unsubscribePointerDown = subscribeGwapPointerDown(onPointerDown);
    const unsubscribeClick = subscribeGwapClick(onClick);
    document.addEventListener("pointerup", onPointerUp, { capture: true });
    document.addEventListener("pointercancel", onPointerCancel, { capture: true });

    return () => {
      unsubscribeEnhancer();
      tapCandidates.clear();
      feedbackTimers.forEach((timer) => window.clearTimeout(timer));
      feedbackTimers.clear();
      unsubscribePointerDown();
      unsubscribeClick();
      document.removeEventListener("pointerup", onPointerUp, { capture: true });
      document.removeEventListener("pointercancel", onPointerCancel, { capture: true });
    };
  }, []);

  return null;
}
