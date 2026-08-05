"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import part1 from "./splash-data/part-1";
import part2 from "./splash-data/part-2";
import part3 from "./splash-data/part-3";
import part4 from "./splash-data/part-4";
import part5 from "./splash-data/part-5";
import part6 from "./splash-data/part-6";
import part7 from "./splash-data/part-7";
import part8 from "./splash-data/part-8";
import part9 from "./splash-data/part-9";
import part10 from "./splash-data/part-10";
import part11 from "./splash-data/part-11";
import part12 from "./splash-data/part-12";
import part13 from "./splash-data/part-13";
import part14 from "./splash-data/part-14";

const INTRO_SESSION_KEY = "gwap-premium-intro-seen-v1";
const INTRO_HOLD_MS = 2100;
const INTRO_EXIT_MS = 720;
const ROUTE_HOLD_MS = 260;
const ROUTE_EXIT_MS = 520;
const ROUTE_FALLBACK_MS = 1800;
const SPLASH_SRC = `data:image/webp;base64,${[
  part1,
  part2,
  part3,
  part4,
  part5,
  part6,
  part7,
  part8,
  part9,
  part10,
  part11,
  part12,
  part13,
  part14,
].join("")}`;

type OverlayMode = "intro" | "route" | null;

export default function PremiumSplash() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const routePending = useRef(false);
  const timers = useRef<number[]>([]);
  const previousBodyOverflow = useRef<string | null>(null);
  const [mode, setMode] = useState<OverlayMode>("intro");
  const [leaving, setLeaving] = useState(false);

  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);

  const unlockBody = useCallback(() => {
    if (previousBodyOverflow.current === null) return;
    document.body.style.overflow = previousBodyOverflow.current;
    previousBodyOverflow.current = null;
  }, []);

  const dismissIntro = useCallback(() => {
    try {
      window.sessionStorage.setItem(INTRO_SESSION_KEY, "true");
    } catch {
      // The experience still works when storage is unavailable.
    }

    clearTimers();
    setLeaving(true);
    const timer = window.setTimeout(() => {
      setMode(null);
      setLeaving(false);
      unlockBody();
    }, INTRO_EXIT_MS);
    timers.current.push(timer);
  }, [clearTimers, unlockBody]);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let hasSeenIntro = false;

    try {
      hasSeenIntro = window.sessionStorage.getItem(INTRO_SESSION_KEY) === "true";
    } catch {
      hasSeenIntro = false;
    }

    if (hasSeenIntro || reducedMotion) {
      setMode(null);
      setLeaving(false);
      return;
    }

    try {
      window.sessionStorage.setItem(INTRO_SESSION_KEY, "true");
    } catch {
      // Ignore storage failures and continue with the visual experience.
    }

    previousBodyOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const exitTimer = window.setTimeout(() => setLeaving(true), INTRO_HOLD_MS);
    const hideTimer = window.setTimeout(() => {
      setMode(null);
      setLeaving(false);
      unlockBody();
    }, INTRO_HOLD_MS + INTRO_EXIT_MS);
    timers.current.push(exitTimer, hideTimer);

    return () => {
      clearTimers();
      unlockBody();
    };
  }, [clearTimers, unlockBody]);

  useEffect(() => {
    const handleInternalNavigation = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a");
      if (!anchor || anchor.dataset.noTransition === "true") return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }

      const destination = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      const isSameDocument =
        destination.origin === current.origin &&
        destination.pathname === current.pathname &&
        destination.search === current.search;

      if (destination.origin !== current.origin || isSameDocument) return;

      clearTimers();
      routePending.current = true;
      flushSync(() => {
        setLeaving(false);
        setMode("route");
      });

      const fallbackTimer = window.setTimeout(() => {
        setLeaving(true);
        const hideTimer = window.setTimeout(() => {
          setMode(null);
          setLeaving(false);
          routePending.current = false;
        }, ROUTE_EXIT_MS);
        timers.current.push(hideTimer);
      }, ROUTE_FALLBACK_MS);
      timers.current.push(fallbackTimer);
    };

    document.addEventListener("click", handleInternalNavigation, true);
    return () => document.removeEventListener("click", handleInternalNavigation, true);
  }, [clearTimers]);

  useEffect(() => {
    if (pathname === previousPathname.current) return;
    previousPathname.current = pathname;

    clearTimers();

    if (!routePending.current) {
      setLeaving(false);
      setMode("route");
    }

    routePending.current = true;
    const exitTimer = window.setTimeout(() => setLeaving(true), ROUTE_HOLD_MS);
    const hideTimer = window.setTimeout(() => {
      setMode(null);
      setLeaving(false);
      routePending.current = false;
    }, ROUTE_HOLD_MS + ROUTE_EXIT_MS);

    timers.current.push(exitTimer, hideTimer);
  }, [clearTimers, pathname]);

  if (!mode) return null;

  return (
    <div
      className={`premium-splash premium-splash--${mode}${leaving ? " is-leaving" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={mode === "intro" ? "Entering the GWAP ecosystem" : "Loading the next page"}
    >
      <div
        className="premium-splash__backdrop"
        style={{ backgroundImage: `url("${SPLASH_SRC}")` }}
        aria-hidden="true"
      />
      <div className="premium-splash__art" aria-hidden="true">
        <img
          src={SPLASH_SRC}
          alt=""
          width="400"
          height="864"
          fetchPriority="high"
          decoding="async"
        />
      </div>

      <div className="premium-splash__veil" aria-hidden="true" />
      <div className="premium-splash__grain" aria-hidden="true" />
      <div className="premium-splash__frame" aria-hidden="true" />

      {mode === "intro" ? (
        <>
          <button className="premium-splash__skip" type="button" onClick={dismissIntro}>
            Skip intro
          </button>
          <div className="premium-splash__intro-copy">
            <span>GWAP ECOSYSTEM</span>
            <strong>Built with purpose.</strong>
          </div>
          <div className="premium-splash__progress" aria-hidden="true">
            <i />
          </div>
        </>
      ) : (
        <div className="premium-splash__route-mark">
          <span className="premium-splash__logo-shell">
            <img src="/logo.png" alt="" width="76" height="76" />
          </span>
          <strong>GWAP</strong>
          <small>Grind With A Purpose</small>
        </div>
      )}
    </div>
  );
}
