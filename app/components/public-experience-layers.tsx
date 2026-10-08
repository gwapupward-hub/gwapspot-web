"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { ConversionTelemetry } from "./conversion-telemetry";
import { GwapContinuityLayer } from "./gwap-continuity-layer";
import { GwapInteractionLayer } from "./gwap-interaction-layer";
import { GwapSensoryPolishLayer } from "./gwap-sensory-polish-layer";
import { GwapSystemMemoryLayer } from "./gwap-system-memory-layer";
import { GwapTouchProductNavigationLayer } from "./gwap-touch-product-navigation-layer";
import PremiumSplash from "./premium-splash";
import { Telemetry } from "../telemetry";

const subscribeToAppHost = () => () => undefined;

function getIsAppHost() {
  return (
    document.documentElement.dataset.gwapAppHost === "true" ||
    window.location.hostname.toLowerCase() === "app.gwapspot.com"
  );
}

export function PublicExperienceLayers() {
  const pathname = usePathname();
  const isAppHost = useSyncExternalStore(
    subscribeToAppHost,
    getIsAppHost,
    () => false,
  );

  const isTelegram =
    pathname === "/telegram" || pathname.startsWith("/telegram/");
  const isApplicationExperience =
    pathname === "/os-entry" ||
    pathname.startsWith("/os-entry/") ||
    pathname === "/os-sign-in" ||
    pathname.startsWith("/os-sign-in/") ||
    pathname === "/refresh" ||
    pathname === "/ppv-commerce-approval" ||
    pathname.startsWith("/ppv-commerce-approval/") ||
    pathname === "/ppv-commerce-approval-83b5e884" ||
    pathname.startsWith("/ppv-commerce-approval-83b5e884/") ||
    pathname === "/app" ||
    pathname.startsWith("/app/");

  const isStandaloneLilGwapz =
    pathname === "/lil-gwapz" || pathname.startsWith("/lil-gwapz/");

  // Campaign pages are top-of-funnel landing targets for shared links: their
  // primary download/browse actions must be tappable immediately, with no
  // intro overlay to dismiss first.
  const isCampaignLanding =
    pathname === "/gwapmojis" || pathname.startsWith("/gwapmojis/");

  if (isAppHost || isTelegram || isApplicationExperience) return null;

  // Lil Gwapz is intentionally a self-contained collection experience. Keep
  // analytics, but do not inherit the ecosystem interaction/sensory/memory
  // layers that give the main GwapSpot site its product-shell behavior.
  if (isStandaloneLilGwapz) {
    return (
      <>
        <Telemetry />
        <ConversionTelemetry />
      </>
    );
  }

  return (
    <>
      <PremiumSplash skipIntro={isCampaignLanding} />
      <GwapTouchProductNavigationLayer />
      <GwapInteractionLayer />
      <GwapSensoryPolishLayer />
      <GwapSystemMemoryLayer />
      <GwapContinuityLayer />
      <Telemetry />
      <ConversionTelemetry />
    </>
  );
}
