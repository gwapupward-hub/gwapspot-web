"use client";

import { track } from "@vercel/analytics";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import styles from "./lil-gwapz-promo-popup.module.css";

const CAMPAIGN_ID = "lil-gwapz-promo";
const WEBSITE_URL = "https://lilgwapz.xyz";
const TELEGRAM_BOT_URL = "https://t.me/ThaLilGwapz_bot";

// Earliest time the modal may appear. It also waits for the homepage intro
// overlay (`.premium-splash`) to be gone, since that overlay stays up until
// the visitor taps Enter.
const SHOW_DELAY_MS = 5000;
const INTRO_SELECTOR = ".premium-splash";
const INTRO_POLL_MS = 400;
// After a dismissal or a click, stay away for a week.
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_KEY = "gwap:lil-gwapz-promo:dismissed-at";

type PromoTarget = "website" | "telegram_bot";

function safeTrack(name: string, properties: Record<string, string>) {
  try {
    track(name, properties);
  } catch {
    // Campaign analytics must never interfere with the page.
  }
}

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

/**
 * Homepage-only promo for Lil Gwapz with the two official links: the website
 * and the Telegram bot. Shows once a visit, after the intro, and stays closed
 * for a week once dismissed or used.
 */
export function LilGwapzPromoPopup() {
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const dismiss = useCallback(() => {
    rememberSnooze();
    setOpen(false);
  }, []);

  useEffect(() => {
    if (isSnoozed()) return;

    let timer: number | undefined;
    let cancelled = false;

    const tryOpen = () => {
      if (cancelled) return;
      if (document.querySelector(INTRO_SELECTOR) === null) {
        setOpen(true);
        return;
      }
      timer = window.setTimeout(tryOpen, INTRO_POLL_MS);
    };

    timer = window.setTimeout(tryOpen, SHOW_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    safeTrack("lil_gwapz_promo_impression", { campaign_id: CAMPAIGN_ID });
    closeButtonRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, dismiss]);

  if (!open) return null;

  const onLinkClick = (target: PromoTarget) => {
    safeTrack("lil_gwapz_promo_click", { campaign_id: CAMPAIGN_ID, target });
    rememberSnooze();
    setOpen(false);
  };

  // Keep Tab focus inside the dialog while it is open.
  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lil-gwapz-promo-title"
        aria-describedby="lil-gwapz-promo-body"
        className={styles.dialog}
        onKeyDown={trapFocus}
      >
        <button
          ref={closeButtonRef}
          type="button"
          className={styles.close}
          onClick={dismiss}
          aria-label="Close the Lil Gwapz promo"
        >
          ×
        </button>

        <h2 id="lil-gwapz-promo-title" className={styles.title}>
          Lil Gwapz
        </h2>
        <p id="lil-gwapz-promo-body" className={styles.body}>
          152 reaction stickers from Reaction Pack 01, 76 male and 76 female. Browse and
          download them on the official site, or get the sticker sets from the Telegram bot.
        </p>

        <ul className={styles.links}>
          <li>
            <a
              className={styles.link}
              href={WEBSITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onLinkClick("website")}
            >
              <span className={styles.linkName}>lilgwapz.xyz</span>
              <span className={styles.linkNote}>Official website</span>
            </a>
          </li>
          <li>
            <a
              className={styles.link}
              href={TELEGRAM_BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onLinkClick("telegram_bot")}
            >
              <span className={styles.linkName}>@ThaLilGwapz_bot</span>
              <span className={styles.linkNote}>Telegram bot and sticker sets</span>
            </a>
          </li>
        </ul>

        <button type="button" className={styles.later} onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
