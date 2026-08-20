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
  if (pathname === "/telegram" || pathname.startsWith("/telegram/")) return null;

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
