"use client";

import { useEffect } from "react";
import {
  getGwapEntryIntentForPath,
  GWAP_ENTRY_INTENT_COOKIE_KEY,
  GWAP_ENTRY_INTENT_STORAGE_KEY,
} from "../lib/entry-intent";

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

      try {
        window.localStorage.setItem(GWAP_ENTRY_INTENT_STORAGE_KEY, intent);
      } catch {
        // Storage can be unavailable in hardened/private browser contexts.
      }

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
