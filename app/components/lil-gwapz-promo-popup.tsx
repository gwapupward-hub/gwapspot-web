"use client";

import { track } from "@vercel/analytics";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import { lilGwapzDieCut, type LilGwapzDieCut } from "../lib/lil-gwapz-diecut";
import stickerData from "../lib/lil-gwapz-stickers.generated.json";
import {
  buildLilGwapzCells,
  LIL_GWAPZ_SITE_URL,
  LIL_GWAPZ_TELEGRAM_BOT_URL,
  type CanonicalLilGwapzReaction,
  type LilGwapzCell,
} from "../lib/lil-gwapz-stickers";
import styles from "./lil-gwapz-promo-popup.module.css";

const CAMPAIGN_ID = "lil-gwapz-promo";
const CELLS = buildLilGwapzCells(stickerData as CanonicalLilGwapzReaction[]);
const BY_KEY = new Map(CELLS.map((cell) => [cell.key, cell]));

// The card opens on a Friendly Wave; which character waves is picked once per load.
const HERO_KEY = Math.random() < 0.5 ? "4-M" : "4-F";

// Stickers that fly out from behind the card: key, x and y as fractions of the
// card size measured from its center, and rotation. Wide screens get them
// around the card; narrow screens tuck them behind its corners.
type BurstSlot = readonly [key: string, x: number, y: number, rotate: number];
const BURST_WIDE: readonly BurstSlot[] = [
  ["2-F", -0.86, -0.3, -12],
  ["35-M", -0.95, 0.12, 8],
  ["22-M", -0.82, 0.5, -6],
  ["3-M", 0.88, -0.32, 11],
  ["9-F", 0.96, 0.1, -8],
  ["25-F", 0.84, 0.5, 6],
];
const BURST_TUCKED: readonly BurstSlot[] = [
  ["2-F", -0.47, -0.4, -14],
  ["3-M", 0.47, -0.37, 12],
  ["22-M", -0.47, 0.47, 9],
  ["25-F", 0.46, 0.49, -10],
];

type Burst = { key: string; art: LilGwapzDieCut; x: number; y: number; rotate: number };

function safeTrack(name: string, properties: Record<string, string | number>) {
  try {
    track(name, properties);
  } catch {
    // Campaign analytics must never interfere with the page.
  }
}

function cellFor(key: string) {
  const cell = BY_KEY.get(key);
  if (!cell) throw new Error(`Unknown Lil Gwapz sticker ${key}`);
  return cell;
}

/** Starts loading the artwork and display font so the card opens complete. */
export function warmLilGwapzPromo() {
  const keys = [HERO_KEY, ...BURST_WIDE.map(([key]) => key)];
  for (const key of keys) lilGwapzDieCut(cellFor(key)).catch(() => undefined);
  try {
    void document.fonts?.load('40px "Lil Gwapz Display"');
  } catch {
    // Font loading is a nicety.
  }
}

function Lockup() {
  return (
    <svg className={styles.lockup} viewBox="-34 -14 868 360" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="lgp-gz-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9bff86" />
          <stop offset="0.48" stopColor="#13dd13" />
          <stop offset="1" stopColor="#07a307" />
        </linearGradient>
        <linearGradient id="lgp-lil-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd27a" />
          <stop offset="0.5" stopColor="#ff8a19" />
          <stop offset="1" stopColor="#e25a00" />
        </linearGradient>
        <linearGradient id="lgp-gloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.12" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.46" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g>
        <text x="400" y="318" textAnchor="middle" fontSize="212" fill="#fffdf8" stroke="#fffdf8" strokeWidth="40">GWAPZ</text>
        <text x="400" y="318" textAnchor="middle" fontSize="212" fill="url(#lgp-gz-fill)" stroke="#063b10" strokeWidth="11">GWAPZ</text>
        <text x="400" y="318" textAnchor="middle" fontSize="212" fill="url(#lgp-gloss)">GWAPZ</text>
      </g>
      <g transform="rotate(-9 96 104)">
        <text x="96" y="146" textAnchor="middle" fontSize="112" fill="#fffdf8" stroke="#fffdf8" strokeWidth="32">LIL</text>
        <text x="96" y="146" textAnchor="middle" fontSize="112" fill="url(#lgp-lil-fill)" stroke="#5e1f00" strokeWidth="9">LIL</text>
        <text x="96" y="146" textAnchor="middle" fontSize="112" fill="url(#lgp-gloss)">LIL</text>
      </g>
    </svg>
  );
}

type PopupProps = {
  /** Called after the closing animation; the gate remembers the dismissal. */
  onClose: () => void;
};

export default function LilGwapzPromoPopup({ onClose }: PopupProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [hero, setHero] = useState<LilGwapzCell>(() => cellFor(HERO_KEY));
  // Art is keyed to its sticker so a tap swaps art and caption together once ready.
  const [heroArt, setHeroArt] = useState<{ cell: LilGwapzCell; art: LilGwapzDieCut } | null>(null);
  const [shuffles, setShuffles] = useState(0);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [leaving, setLeaving] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const close = useCallback(() => {
    if (leaving) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setLeaving(true);
    window.setTimeout(onClose, reduced ? 0 : 240);
  }, [leaving, onClose]);

  // Opening: impression, focus, scroll lock, Escape. Focus returns on close.
  useEffect(() => {
    safeTrack("lil_gwapz_promo_impression", { campaign_id: CAMPAIGN_ID });
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus({ preventScroll: true });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  // Character art.
  useEffect(() => {
    let live = true;
    lilGwapzDieCut(hero)
      .then((art) => {
        if (live) setHeroArt({ cell: hero, art });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [hero]);

  // Sticker burst, laid out from the card's real size.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let live = true;
    const layout = () => {
      const { width, height } = frame.getBoundingClientRect();
      const wide = window.innerWidth >= width * 2.7;
      const slots = wide ? BURST_WIDE : BURST_TUCKED;
      Promise.all(
        slots.map(([key, x, y, rotate]) =>
          lilGwapzDieCut(cellFor(key))
            .then((art): Burst => ({ key, art, x: x * width, y: y * height, rotate }))
            .catch(() => null),
        ),
      ).then((list) => {
        if (live) setBursts(list.filter((item): item is Burst => item !== null));
      });
    };
    layout();
    window.addEventListener("resize", layout);
    return () => {
      live = false;
      window.removeEventListener("resize", layout);
    };
  }, []);

  const shuffle = () => {
    const pool = CELLS.filter((cell) => cell.key !== hero.key);
    const next = pool[Math.floor(Math.random() * pool.length)];
    setHero(next);
    setShuffles((count) => count + 1);
    setAnnouncement(`${next.reaction}`);
    safeTrack("lil_gwapz_promo_shuffle", { campaign_id: CAMPAIGN_ID, reaction: next.key });
  };

  const onLinkClick = (target: "website" | "telegram_bot") => {
    safeTrack("lil_gwapz_promo_click", { campaign_id: CAMPAIGN_ID, target });
    close();
  };

  // Keep Tab focus inside the dialog.
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

  const shown = heroArt?.cell;
  const bubbleText = shuffles === 0 || !shown ? "Tap me" : `${shown.emoji} ${shown.reaction}`;

  return (
    <div
      className={styles.backdrop}
      data-leaving={leaving}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className={styles.frame} ref={frameRef}>
        {bursts.map((burst, index) => (
          // eslint-disable-next-line @next/next/no-img-element -- runtime blob URL from the die-cut renderer
          <img
            key={burst.key}
            className={styles.burst}
            src={burst.art.src}
            width={burst.art.width}
            height={burst.art.height}
            alt=""
            draggable={false}
            style={
              {
                "--x": `${burst.x}px`,
                "--y": `${burst.y}px`,
                "--r": `${burst.rotate}deg`,
                "--d": `${380 + index * 60}ms`,
              } as CSSProperties
            }
          />
        ))}

        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lil-gwapz-promo-title"
          aria-describedby="lil-gwapz-promo-body"
          className={styles.card}
          onKeyDown={trapFocus}
        >
          <button
            type="button"
            className={styles.hero}
            data-ready={heroArt !== null}
            onClick={shuffle}
            aria-label="Show another Lil Gwapz reaction"
          >
            {heroArt ? (
              // eslint-disable-next-line @next/next/no-img-element -- runtime blob URL from the die-cut renderer
              <img
                key={heroArt.cell.key}
                className={styles.heroArt}
                data-shuffled={shuffles > 0}
                src={heroArt.art.src}
                width={heroArt.art.width}
                height={heroArt.art.height}
                alt=""
                draggable={false}
              />
            ) : null}
          </button>
          {heroArt ? (
            <span key={bubbleText} className={styles.bubble} data-shuffled={shuffles > 0} aria-hidden="true">
              {bubbleText}
            </span>
          ) : null}

          <div className={styles.face} aria-hidden="true" />

          <div className={styles.body}>
            <button
              ref={closeButtonRef}
              type="button"
              className={styles.close}
              onClick={close}
              aria-label="Close the Lil Gwapz promo"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>

            <h2 id="lil-gwapz-promo-title" className={styles.title}>
              <span className={styles.srOnly}>Lil Gwapz</span>
              <Lockup />
            </h2>
            <p id="lil-gwapz-promo-body" className={styles.lede}>
              152 reaction stickers. Every mood, every chat.
            </p>

            <ul className={styles.links}>
              <li>
                <a
                  className={`${styles.tile} ${styles.tileSite}`}
                  href={LIL_GWAPZ_SITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onLinkClick("website")}
                >
                  <span className={styles.tileIcon} aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M14.5 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V9.5z" />
                      <path d="M14.5 3v3.5a3 3 0 0 0 3 3H21" />
                    </svg>
                  </span>
                  <span className={styles.tileText}>
                    <span className={styles.tileName}>lilgwapz.xyz</span>
                    <span className={styles.tileNote}>Official site with the sticker wall</span>
                  </span>
                </a>
              </li>
              <li>
                <a
                  className={`${styles.tile} ${styles.tileBot}`}
                  href={LIL_GWAPZ_TELEGRAM_BOT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onLinkClick("telegram_bot")}
                >
                  <span className={styles.tileIcon} aria-hidden="true">
                    <svg viewBox="0 0 24 24" className={styles.plane}>
                      <path d="M21.4 3.6 2.9 10.7c-1.3.5-1.3 1.2-.2 1.6l4.7 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.9-1.4-1.5zM9.6 14.1l8.6-5.4c.4-.2.8-.1.5.2l-7.1 6.4-.3 3.2z" />
                    </svg>
                  </span>
                  <span className={styles.tileText}>
                    <span className={styles.tileName}>@ThaLilGwapz_bot</span>
                    <span className={styles.tileNote}>Official bot for the sticker sets</span>
                  </span>
                </a>
              </li>
            </ul>

            <button type="button" className={styles.later} onClick={close}>
              Not now
            </button>
          </div>

          <p className={styles.srOnly} aria-live="polite">
            {announcement}
          </p>
        </div>
      </div>
    </div>
  );
}
