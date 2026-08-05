"use client";

import { track } from "@vercel/analytics";
import { useEffect } from "react";

const productHosts = new Set([
  "gwapspot.fun",
  "dimimusic.xyz",
  "isnadsunnah.vercel.app",
  "slink.bigovideo.tv",
]);

const communityHosts = new Set([
  "x.com",
  "t.me",
  "github.com",
  "www.instagram.com",
  "instagram.com",
]);

export function Telemetry() {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const rawHref = anchor.getAttribute("href") ?? "";
      const label = anchor.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) || "unknown";

      if (rawHref.includes("#ecosystem")) {
        track("ecosystem_explore", { source: label });
        return;
      }

      let url: URL;
      try {
        url = new URL(anchor.href);
      } catch {
        return;
      }

      if (productHosts.has(url.hostname)) {
        const productName = anchor.querySelector("h3")?.textContent?.trim() || label;
        track("product_launch", {
          product: productName.slice(0, 80),
          destination: url.hostname,
        });
        return;
      }

      if (communityHosts.has(url.hostname)) {
        track("community_click", {
          channel: label,
          destination: url.hostname,
        });
      }
    };

    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, []);

  return null;
}
