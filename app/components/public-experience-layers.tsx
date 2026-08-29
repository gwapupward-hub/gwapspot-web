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
    pathname === "/app" ||
    pathname.startsWith("/app/");

  if (isAppHost || isTelegram || isApplicationExperience) return null;

  return (
    <>
      <PremiumSplash />
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
