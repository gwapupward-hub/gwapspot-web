"use client";

import { track } from "@vercel/analytics";
import { useEffect } from "react";

type AnalyticsProperties = Record<string, string | number | boolean>;

type LookupState = {
  attempt: number;
  mode: "wallet" | "name" | "unknown";
  completed: boolean;
  outcome: string | null;
};

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

function getLookupMode() {
  const active = document.querySelector<HTMLButtonElement>(
    '.hero-utility-tabs button[aria-pressed="true"]',
  );
  const label = normalizeLabel(active?.textContent).toLowerCase();
  if (label.includes("wallet")) return "wallet" as const;
  if (label.includes("gwap") || label.includes("name")) return "name" as const;
  return "unknown" as const;
}

function getLookupOutcome() {
  const result = document.querySelector<HTMLElement>(
    ".hero-utility-feedback .hero-utility-result",
  );
  if (!result) return null;

  const signal = normalizeLabel(result.querySelector("small")?.textContent).toLowerCase();
  if (signal.includes("available")) return "name_available";
  if (signal.includes("registered")) return "name_registered";
  if (signal.includes("identity + reputation")) return "identity_found";
  if (signal.includes("wallet found")) return "wallet_scored_no_identity";
  return "result_shown";
}

function classifyConversionLink(anchor: HTMLAnchorElement) {
  const section = anchor.closest<HTMLElement>("section[id]")?.id || "unknown";
  const href = anchor.getAttribute("href") || "";
  const label = normalizeLabel(anchor.textContent);

  if (section === "top" && anchor.closest(".hero-ctas")) {
    if (href.startsWith("/app/identity")) return { event: "hero_conversion_click", action: "claim_identity", label };
    if (href === "/app") return { event: "hero_conversion_click", action: "enter_os", label };
  }

  if (section === "overview" && anchor.closest(".overview-foundation")) {
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
    let lookupState: LookupState = {
      attempt: 0,
      mode: "unknown",
      completed: false,
      outcome: null,
    };

    const handleSubmit = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.matches(".hero-utility-form")) return;

      lookupState = {
        attempt: lookupState.attempt + 1,
        mode: getLookupMode(),
        completed: false,
        outcome: null,
      };

      safeTrack("lookup_started", {
        mode: lookupState.mode,
        source: "hero",
      });
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

    const feedback = document.querySelector<HTMLElement>(".hero-utility-feedback");
    const feedbackObserver = feedback
      ? new MutationObserver(() => {
          const error = feedback.querySelector(".is-error");
          if (error && !lookupState.completed) {
            lookupState.completed = true;
            lookupState.outcome = "error";
            safeTrack("lookup_completed", {
              mode: lookupState.mode,
              outcome: "error",
              source: "hero",
            });
            return;
          }

          const outcome = getLookupOutcome();
          if (!outcome) return;

          if (!lookupState.completed) {
            lookupState.completed = true;
            lookupState.outcome = outcome;
            safeTrack("lookup_completed", {
              mode: lookupState.mode,
              outcome,
              source: "hero",
            });
            return;
          }

          if (
            lookupState.outcome === "wallet_scored_no_identity" &&
            outcome === "identity_found"
          ) {
            lookupState.outcome = outcome;
            safeTrack("lookup_identity_recovered", {
              mode: "wallet",
              source: "hero",
            });
          }
        })
      : null;

    feedbackObserver?.observe(feedback!, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    document.addEventListener("submit", handleSubmit, { capture: true });
    document.addEventListener("click", handleClick, { capture: true });

    return () => {
      feedbackObserver?.disconnect();
      document.removeEventListener("submit", handleSubmit, { capture: true });
      document.removeEventListener("click", handleClick, { capture: true });
    };
  }, []);

  return null;
}
