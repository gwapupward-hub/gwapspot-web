"use client";

import { usePathname } from "next/navigation";
import { ConversionTelemetry } from "./conversion-telemetry";
import { GwapContinuityLayer } from "./gwap-continuity-layer";
import { GwapInteractionLayer } from "./gwap-interaction-layer";
import { GwapSensoryPolishLayer } from "./gwap-sensory-polish-layer";
import { GwapSystemMemoryLayer } from "./gwap-system-memory-layer";
import { GwapTouchProductNavigationLayer } from "./gwap-touch-product-navigation-layer";
import PremiumSplash from "./premium-splash";
import { Telemetry } from "../telemetry";

export function PublicExperienceLayers() {
  const pathname = usePathname();
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

  if (isTelegram || isApplicationExperience) return null;

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
