"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

// The popup (and its sticker data and artwork) loads only when it is about to open.
const LilGwapzPromoPopup = dynamic(() => import("./lil-gwapz-promo-popup"), { ssr: false });

// Earliest time the popup may open. It also waits for the homepage intro
// overlay (`.premium-splash`), which stays up until the visitor taps Enter.
const SHOW_DELAY_MS = 5000;
// Start fetching the popup's code and artwork a little before that.
const WARM_DELAY_MS = 2500;
const INTRO_SELECTOR = ".premium-splash";
const INTRO_POLL_MS = 400;
// After a dismissal or a link click, stay away for a week.
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_KEY = "gwap:lil-gwapz-promo:dismissed-at";

function isSnoozed() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const dismissedAt = Number(raw);
    return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < SNOOZE_MS;
  } catch {
    return false;
  }
}

function rememberSnooze() {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // Storage can be blocked; the popup will simply show again next visit.
  }
}

/** Homepage-only Lil Gwapz promo: decides when (and whether) the popup opens. */
export function LilGwapzPromoGate() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isSnoozed()) return;

    let cancelled = false;
    let openTimer: number | undefined;

    const warmTimer = window.setTimeout(() => {
      import("./lil-gwapz-promo-popup")
        .then((popup) => popup.warmLilGwapzPromo())
        .catch(() => undefined);
    }, WARM_DELAY_MS);

    const tryOpen = () => {
      if (cancelled) return;
      if (document.querySelector(INTRO_SELECTOR) === null) {
        setOpen(true);
        return;
      }
      openTimer = window.setTimeout(tryOpen, INTRO_POLL_MS);
    };
    openTimer = window.setTimeout(tryOpen, SHOW_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(warmTimer);
      window.clearTimeout(openTimer);
    };
  }, []);

  const close = useCallback(() => {
    rememberSnooze();
    setOpen(false);
  }, []);

  return open ? <LilGwapzPromoPopup onClose={close} /> : null;
}
