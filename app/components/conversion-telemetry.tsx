"use client";

import { track } from "@vercel/analytics";
import { useEffect } from "react";
import {
  isMeaningfulPublicLookupOutcome,
  PUBLIC_LOOKUP_EVENT,
  type PublicLookupEventDetail,
} from "../lib/public-first-value";

type AnalyticsProperties = Record<string, string | number | boolean>;

function firstValueTimeBucket(elapsedSeconds: number) {
  if (elapsedSeconds < 30) return "under_30s";
  if (elapsedSeconds < 120) return "30s_to_2m";
  if (elapsedSeconds <= 300) return "2m_to_5m";
  return "5m_plus";
}

function safeTrack(name: string, properties: AnalyticsProperties) {
  try {
    track(name, properties);
  } catch {
    // Conversion analytics must never interfere with the product experience.
  }
}

function normalizeLabel(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim().slice(0, 80) || "unknown";
}

function classifyConversionLink(anchor: HTMLAnchorElement) {
  const section = anchor.closest<HTMLElement>("section[id]")?.id || "unknown";
  const href = anchor.getAttribute("href") || "";
  const label = normalizeLabel(anchor.textContent);

  if (section === "top" && anchor.closest(".hero-ctas")) {
    if (href === "#lookup") return { event: "hero_conversion_click", action: "public_lookup", label };
    if (href === "#overview") return { event: "hero_conversion_click", action: "choose_goal", label };
    if (href.startsWith("/app/identity")) return { event: "hero_conversion_click", action: "claim_identity", label };
    if (href === "/app") return { event: "hero_conversion_click", action: "enter_os", label };
  }

  if (section === "overview" && anchor.closest(".overview-foundation")) {
    const intent = anchor.dataset.gwapIntent;
    if (["build_project", "validate_idea", "identity", "reputation", "proof"].includes(intent || "")) {
      return { event: "intent_path_selected", action: intent || "unknown", label };
    }
    if (href.startsWith("/app/identity")) return { event: "intent_path_selected", action: "identity", label };
    if (href === "#top") return { event: "intent_path_selected", action: "reputation", label };
    if (href === "/app") return { event: "intent_path_selected", action: "os", label };
  }

  if (anchor.closest(".hero-utility-result-actions")) {
    const lower = label.toLowerCase();
    if (lower.includes("claim")) return { event: "lookup_activation_click", action: "claim_name", label };
    if (lower.includes("initialize")) return { event: "lookup_activation_click", action: "initialize_identity", label };
    if (lower.includes("profile")) return { event: "lookup_activation_click", action: "open_profile", label };
  }

  return null;
}

export function ConversionTelemetry() {
  useEffect(() => {
    const pageStart = performance.now();
    let firstValueTracked = false;

    const recordFirstValue = (detail: Extract<PublicLookupEventDetail, { phase: "completed" | "recovered" }>) => {
      if (firstValueTracked) return;
      firstValueTracked = true;
      safeTrack("first_value_reached", {
        mode: detail.mode,
        outcome: detail.outcome,
        elapsed_bucket: firstValueTimeBucket((performance.now() - pageStart) / 1000),
        source: "homepage",
      });
    };

    const handleLookup = (event: Event) => {
      const detail = (event as CustomEvent<PublicLookupEventDetail>).detail;
      if (!detail || !Number.isSafeInteger(detail.attempt) || detail.attempt < 1) return;
      if (detail.mode !== "wallet" && detail.mode !== "name") return;
      if (detail.phase === "started") {
        safeTrack("lookup_started", { mode: detail.mode, source: "hero" });
        return;
      }
      if (detail.phase !== "completed" && detail.phase !== "recovered") return;
      if (detail.phase === "recovered") {
        safeTrack("lookup_identity_recovered", { mode: detail.mode, source: "hero" });
      } else {
        safeTrack("lookup_completed", {
          mode: detail.mode,
          outcome: detail.outcome,
          source: "hero",
        });
      }
      if (isMeaningfulPublicLookupOutcome(detail.outcome)) recordFirstValue(detail);
    };

    const handleClick = (event: MouseEvent) => {
      if (!event.isTrusted) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const conversion = classifyConversionLink(anchor);
      if (!conversion) return;

      safeTrack(conversion.event, {
        action: conversion.action,
        label: conversion.label,
        source: anchor.closest<HTMLElement>("section[id]")?.id || "unknown",
      });
    };

    window.addEventListener(PUBLIC_LOOKUP_EVENT, handleLookup);
    document.addEventListener("click", handleClick, { capture: true });

    return () => {
      window.removeEventListener(PUBLIC_LOOKUP_EVENT, handleLookup);
      document.removeEventListener("click", handleClick, { capture: true });
    };
  }, []);

  return null;
}
