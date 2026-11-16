"use client";

import { useEffect } from "react";
import {
  activationSurface,
  createActivationProgress,
  GWAP_ACTIVATION_COOKIE_KEY,
  GWAP_ACTIVATION_SIGNAL_COOKIE_KEY,
  GWAP_ACTIVATION_STORAGE_KEY,
  serializeActivationSelection,
} from "../lib/activation-analytics";
import {
  getGwapEntryIntentForPublicGoal,
  getGwapEntryIntentForPath,
  GWAP_ENTRY_INTENT_COOKIE_KEY,
  GWAP_ENTRY_INTENT_STORAGE_KEY,
} from "../lib/entry-intent";

function safeTrack(
  name: string,
  properties: Record<string, string | number | boolean>,
) {
  void import("@vercel/analytics")
    .then(({ track }) => track(name, properties))
    .catch(() => undefined);
}

export function EntryIntentBridge() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (
        window.location.pathname !== "/" ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      ) {
        return;
      }

      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;

      const inGoalCards = Boolean(anchor.closest(".overview-foundation"));
      const inLookupActions = Boolean(anchor.closest(".hero-utility-result-actions"));
      if (!inGoalCards && !inLookupActions) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (inLookupActions && destination.pathname !== "/app/identity") return;

      const intent = inGoalCards
        ? getGwapEntryIntentForPublicGoal(anchor.dataset.gwapIntent) ?? getGwapEntryIntentForPath(destination.pathname)
        : "identity";
      if (!intent) return;

      const progress = createActivationProgress(intent);
      try {
        window.localStorage.setItem(GWAP_ENTRY_INTENT_STORAGE_KEY, intent);
        window.localStorage.setItem(
          GWAP_ACTIVATION_STORAGE_KEY,
          JSON.stringify(progress),
        );
      } catch {
        // Storage can be unavailable in hardened/private browser contexts.
      }

      safeTrack("intent_selected", {
        intent,
        source: inGoalCards ? "public_overview" : "public_lookup",
        surface: activationSurface(intent),
      });

      const host = window.location.hostname.toLowerCase();
      const sharedDomain = host === "gwapspot.com" || host.endsWith(".gwapspot.com");
      const domain = sharedDomain ? "; Domain=.gwapspot.com" : "";
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      const scope = `Path=/; SameSite=Lax${domain}${secure}`;
      const persistent = `${scope}; Max-Age=2592000`;
      document.cookie = `${GWAP_ACTIVATION_SIGNAL_COOKIE_KEY}=; ${scope}; Max-Age=0`;
      document.cookie = `${GWAP_ENTRY_INTENT_COOKIE_KEY}=${encodeURIComponent(intent)}; ${persistent}`;
      document.cookie = `${GWAP_ACTIVATION_COOKIE_KEY}=${encodeURIComponent(serializeActivationSelection(progress))}; ${persistent}`;

      // The identity goal stays on the public lookup. A claim action keeps
      // its exact /app/identity?name=... destination through sign-in.
      if (inGoalCards && destination.pathname.startsWith("/app")) {
        event.preventDefault();
        window.location.assign("/app");
      }
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
