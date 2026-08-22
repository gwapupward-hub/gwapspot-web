"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect } from "react";
import type { GnsIdentity } from "../lib/os-state";
import { useGwapOs } from "./os-provider";

export function GnsIdentityHydrationBridge() {
  const { getAccessToken } = usePrivy();
  const { updateGnsIdentity } = useGwapOs();

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const token = await getAccessToken();
        const headers = new Headers({ Accept: "application/json" });
        if (token) headers.set("Authorization", `Bearer ${token}`);
        const response = await fetch("/api/gns/identity", {
          cache: "no-store",
          credentials: "same-origin",
          headers,
        });
        if (!response.ok || cancelled) return;

        const payload = (await response.json()) as { identity?: GnsIdentity };
        if (!payload.identity || payload.identity.status === "unavailable") return;
        updateGnsIdentity(payload.identity);
      } catch {
        // Cached GNS identity remains available when reconciliation is offline.
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [getAccessToken, updateGnsIdentity]);

  return null;
}
