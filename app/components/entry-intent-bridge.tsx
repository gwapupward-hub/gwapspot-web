"use client";

import { useEffect } from "react";
import {
  activationSurface,
  createActivationProgress,
  GWAP_ACTIVATION_STORAGE_KEY,
} from "../lib/activation-analytics";
import {
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
      if (!anchor || !anchor.closest(".overview-foundation")) return;

      const destination = new URL(anchor.href, window.location.href);
      const intent = getGwapEntryIntentForPath(destination.pathname);
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
        source: "public_overview",
        surface: activationSurface(intent),
      });

      const host = window.location.hostname.toLowerCase();
      const sharedDomain = host === "gwapspot.com" || host.endsWith(".gwapspot.com");
      const domain = sharedDomain ? "; Domain=.gwapspot.com" : "";
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${GWAP_ENTRY_INTENT_COOKIE_KEY}=${encodeURIComponent(intent)}; Path=/; Max-Age=2592000; SameSite=Lax${domain}${secure}`;

      event.preventDefault();
      window.location.assign("/app");
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
