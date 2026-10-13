"use client";

import { useEffect } from "react";
import {
  getGwapEntryIntentForPath,
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

      event.preventDefault();
      window.location.assign("/app");
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
