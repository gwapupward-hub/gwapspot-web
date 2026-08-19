"use client";

import { useEffect } from "react";

const PRODUCT_LINK_SELECTOR =
  "a.premium-product-card[data-gwap-product], a.product-card[data-native-product-link]";
const TAP_MAX_DISTANCE = 10;
const TAP_MAX_DURATION_MS = 700;

type TouchCandidate = {
  pointerId: number;
  link: HTMLAnchorElement;
  x: number;
  y: number;
  at: number;
};

function getProductLink(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLAnchorElement>(PRODUCT_LINK_SELECTOR);
}

export function GwapTouchProductNavigationLayer() {
  useEffect(() => {
    let candidate: TouchCandidate | null = null;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.pointerType === "mouse") return;
      const link = getProductLink(event.target);
      if (!link) return;

      candidate = {
        pointerId: event.pointerId,
        link,
        x: event.clientX,
        y: event.clientY,
        at: performance.now(),
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!candidate || candidate.pointerId !== event.pointerId) return;
      const distance = Math.hypot(
        event.clientX - candidate.x,
        event.clientY - candidate.y,
      );
      if (distance > TAP_MAX_DISTANCE) candidate = null;
    };

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || !getProductLink(event.target)) return;

      // The ecosystem graph also listens for product-card pointerover events.
      // On iOS Safari that state mutation can happen before the synthesized click,
      // turning the first tap into a graph/card-state change instead of navigation.
      event.stopPropagation();
    };

    const onFocusIn = (event: FocusEvent) => {
      if (!candidate || !getProductLink(event.target)) return;

      // A touch can focus the anchor before click. Keep that transient focus event
      // from driving graph state while a touch navigation is still in progress.
      event.stopPropagation();
    };

    const clearCandidate = (pointerId: number) => {
      if (candidate?.pointerId === pointerId) candidate = null;
    };

    const onPointerUp = (event: PointerEvent) => {
      const current = candidate;
      if (!current || current.pointerId !== event.pointerId) return;
      candidate = null;

      const distance = Math.hypot(
        event.clientX - current.x,
        event.clientY - current.y,
      );
      const duration = performance.now() - current.at;
      const releasedLink = getProductLink(event.target);

      if (
        distance > TAP_MAX_DISTANCE ||
        duration > TAP_MAX_DURATION_MS ||
        releasedLink !== current.link
      ) {
        return;
      }

      // Use a direct browser navigation for touch. This intentionally bypasses
      // client-side hover/focus/router choreography so the first clean tap wins.
      event.preventDefault();
      event.stopPropagation();
      window.location.assign(current.link.href);
    };

    const onPointerCancel = (event: PointerEvent) => {
      clearCandidate(event.pointerId);
    };

    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    document.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });
    document.addEventListener("pointerover", onPointerOver, { capture: true, passive: true });
    document.addEventListener("focusin", onFocusIn, { capture: true });
    document.addEventListener("pointerup", onPointerUp, { capture: true });
    document.addEventListener("pointercancel", onPointerCancel, { capture: true });

    return () => {
      candidate = null;
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
      document.removeEventListener("pointermove", onPointerMove, { capture: true });
      document.removeEventListener("pointerover", onPointerOver, { capture: true });
      document.removeEventListener("focusin", onFocusIn, { capture: true });
      document.removeEventListener("pointerup", onPointerUp, { capture: true });
      document.removeEventListener("pointercancel", onPointerCancel, { capture: true });
    };
  }, []);

  return null;
}
