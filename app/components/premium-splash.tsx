"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

const INTRO_SESSION_KEY = "gwap-premium-intro-seen-v2";
const INTRO_ENTER_DELAY_MS = 2750;
const INTRO_EXIT_MS = 1750;
const ROUTE_HOLD_MS = 900;
const ROUTE_EXIT_MS = 900;
const ROUTE_FALLBACK_MS = 2600;
const ROUTE_REDUCED_HOLD_MS = 80;
const ROUTE_REDUCED_EXIT_MS = 120;
const ROUTE_REDUCED_FALLBACK_MS = 700;
const SPLASH_SRC = "/gwap-splash.webp";

type OverlayMode = "intro" | "route" | null;

export default function PremiumSplash() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const routePending = useRef(false);
  const introExitStarted = useRef(false);
  const timers = useRef<number[]>([]);
  const previousBodyOverflow = useRef<string | null>(null);
  const [mode, setMode] = useState<OverlayMode>("intro");
  const [ready, setReady] = useState(false);
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

  const beginIntroExit = useCallback(() => {
    if (introExitStarted.current) return;
    introExitStarted.current = true;
    clearTimers();
    setReady(true);
    setLeaving(true);

    const hideTimer = window.setTimeout(() => {
      setMode(null);
      setReady(false);
      setLeaving(false);
      unlockBody();
    }, INTRO_EXIT_MS);

    timers.current.push(hideTimer);
  }, [clearTimers, unlockBody]);

  const dismissIntro = useCallback(() => {
    try {
      window.sessionStorage.setItem(INTRO_SESSION_KEY, "true");
    } catch {
      // The experience still works when storage is unavailable.
    }

    beginIntroExit();
  }, [beginIntroExit]);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let hasSeenIntro = false;

    try {
      hasSeenIntro = window.sessionStorage.getItem(INTRO_SESSION_KEY) === "true";
    } catch {
      hasSeenIntro = false;
    }

    if (hasSeenIntro || reducedMotion) {
      const frame = window.requestAnimationFrame(() => {
        setMode(null);
        setReady(false);
        setLeaving(false);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    introExitStarted.current = false;
    previousBodyOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const enterTimer = window.setTimeout(
      () => setReady(true),
      INTRO_ENTER_DELAY_MS,
    );
    timers.current.push(enterTimer);

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
        setReady(false);
        setLeaving(false);
        setMode("route");
      });

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const fallbackMs = reducedMotion ? ROUTE_REDUCED_FALLBACK_MS : ROUTE_FALLBACK_MS;
      const exitMs = reducedMotion ? ROUTE_REDUCED_EXIT_MS : ROUTE_EXIT_MS;

      const fallbackTimer = window.setTimeout(() => {
        setLeaving(true);
        const hideTimer = window.setTimeout(() => {
          setMode(null);
          setLeaving(false);
          routePending.current = false;
        }, exitMs);
        timers.current.push(hideTimer);
      }, fallbackMs);
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
      setReady(false);
      setLeaving(false);
      setMode("route");
    }

    routePending.current = true;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const holdMs = reducedMotion ? ROUTE_REDUCED_HOLD_MS : ROUTE_HOLD_MS;
    const exitMs = reducedMotion ? ROUTE_REDUCED_EXIT_MS : ROUTE_EXIT_MS;
    const exitTimer = window.setTimeout(() => setLeaving(true), holdMs);
    const hideTimer = window.setTimeout(() => {
      setMode(null);
      setLeaving(false);
      routePending.current = false;
    }, holdMs + exitMs);

    timers.current.push(exitTimer, hideTimer);
  }, [clearTimers, pathname]);

  if (!mode) return null;

  return (
    <div
      className={`premium-splash premium-splash--${mode}${ready ? " is-ready" : ""}${leaving ? " is-leaving" : ""}`}
      role="status"
      aria-live="polite"
      aria-busy={mode === "intro" && !ready}
      aria-label={mode === "intro" ? "Preparing the GWAP ecosystem" : "Loading the next page"}
    >
      <div className="premium-splash__art" aria-hidden="true">
        <Image
          src={SPLASH_SRC}
          alt=""
          fill
          sizes="100vw"
          priority
          unoptimized
        />
      </div>

      <div className="premium-splash__veil" aria-hidden="true" />
      <div className="premium-splash__frame" aria-hidden="true" />

      {mode === "intro" ? (
        <>
          {ready ? (
            <button className="premium-splash__skip" type="button" onClick={dismissIntro}>
              Enter Tha GwapSpot
            </button>
          ) : null}
          <div className="premium-splash__intro-copy">
            <span>GWAP ECOSYSTEM</span>
            <strong>{ready ? "Ready with purpose." : "Built with purpose."}</strong>
          </div>
          <div className="premium-splash__progress" aria-hidden="true">
            <i />
          </div>
        </>
      ) : (
        <div className="premium-splash__route-mark">
          <div className="premium-splash__route-logos" aria-hidden="true">
            <span className="premium-splash__logo-shell premium-splash__logo-shell--occo">
              <Image src="/logos/occo.webp" alt="" width={86} height={86} unoptimized />
            </span>
            <span className="premium-splash__logo-shell premium-splash__logo-shell--gwap">
              <Image src="/logos/gwap-agent.png" alt="" width={84} height={84} unoptimized />
            </span>
            <span className="premium-splash__logo-shell premium-splash__logo-shell--gns">
              <Image src="/logos/gns.webp" alt="" width={86} height={86} unoptimized />
            </span>
          </div>
          <strong>GWAP</strong>
          <small>Grind With A Purpose</small>
          <span className="premium-splash__route-line" aria-hidden="true"><i /></span>
        </div>
      )}
    </div>
  );
}
