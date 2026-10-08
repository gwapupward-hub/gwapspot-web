"use client";

import { useEffect } from "react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function installReducedMotionScrollGuard() {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (!media.matches) return () => undefined;

  const originalScrollTo = window.scrollTo;
  const originalScrollIntoView = Element.prototype.scrollIntoView;

  window.scrollTo = ((...args: Parameters<typeof window.scrollTo>) => {
    const [first, second] = args;
    if (typeof first === "object" && first !== null) {
      return originalScrollTo.call(window, { ...first, behavior: "auto" });
    }
    return originalScrollTo.call(window, first, second);
  }) as typeof window.scrollTo;

  Element.prototype.scrollIntoView = function scrollIntoView(
    arg?: boolean | ScrollIntoViewOptions,
  ) {
    if (typeof arg === "object" && arg !== null) {
      return originalScrollIntoView.call(this, { ...arg, behavior: "auto" });
    }
    return originalScrollIntoView.call(this, arg);
  };

  return () => {
    window.scrollTo = originalScrollTo;
    Element.prototype.scrollIntoView = originalScrollIntoView;
  };
}

export default function LilGwapzReviewGuard() {
  useEffect(() => {
    const restoreScrollBehavior = installReducedMotionScrollGuard();
    let activeDialog: HTMLElement | null = null;
    let cleanupDialog: (() => void) | null = null;

    const teardownDialog = () => {
      cleanupDialog?.();
      cleanupDialog = null;
      activeDialog = null;
    };

    const setupDialog = (dialog: HTMLElement) => {
      const previouslyFocused =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      dialog.tabIndex = -1;

      const focusables = () =>
        Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
          (element) => !element.hasAttribute("disabled") && element.getClientRects().length > 0,
        );

      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Tab") return;
        const items = focusables();
        if (items.length === 0) {
          event.preventDefault();
          dialog.focus();
          return;
        }

        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      };

      dialog.addEventListener("keydown", onKeyDown);
      requestAnimationFrame(() => {
        const [first] = focusables();
        (first ?? dialog).focus();
      });

      cleanupDialog = () => {
        dialog.removeEventListener("keydown", onKeyDown);
        document.body.style.overflow = previousOverflow;
        if (previouslyFocused?.isConnected) previouslyFocused.focus();
      };
    };

    const syncDialog = () => {
      const nextDialog = document.querySelector<HTMLElement>(".lg-sheet[role='dialog']");
      if (nextDialog === activeDialog) return;
      teardownDialog();
      if (nextDialog) {
        activeDialog = nextDialog;
        setupDialog(nextDialog);
      }
    };

    const observer = new MutationObserver(syncDialog);
    observer.observe(document.body, { childList: true, subtree: true });
    syncDialog();

    return () => {
      observer.disconnect();
      teardownDialog();
      restoreScrollBehavior();
    };
  }, []);

  return null;
}
