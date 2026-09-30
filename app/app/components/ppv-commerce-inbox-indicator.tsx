"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useGwapOs } from "./os-provider";

type InboxPayload = {
  pendingIncoming?: number;
};

export function PpvCommerceInboxIndicator() {
  const { getAccessToken } = usePrivy();
  const { account, runtimeMode } = useGwapOs();
  const [pending, setPending] = useState(0);

  const refresh = useCallback(async () => {
    if (runtimeMode !== "devnet") {
      setPending(0);
      return;
    }

    try {
      const token = await getAccessToken();
      const headers = new Headers();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const response = await fetch("/api/ppv/commerce/inbox", {
        method: "GET",
        headers,
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) {
        setPending(0);
        return;
      }
      const payload = (await response.json()) as InboxPayload;
      setPending(
        typeof payload.pendingIncoming === "number"
          ? Math.max(0, payload.pendingIncoming)
          : 0,
      );
    } catch {
      setPending(0);
    }
  }, [getAccessToken, runtimeMode]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const onFocus = () => void refresh();
    const onInboxChanged = () => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("gwap:ppv-commerce-inbox-changed", onInboxChanged);

    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("gwap:ppv-commerce-inbox-changed", onInboxChanged);
    };
  }, [account.verifiedWallet, refresh]);

  if (runtimeMode !== "devnet" || pending <= 0) return null;

  return (
    <Link
      href="/app/ppv/agreements"
      className="os-commerce-inbox"
      aria-label={`${pending} pending PPV Commerce agreement${pending === 1 ? "" : "s"}`}
    >
      Contracts
      <span>{pending > 99 ? "99+" : pending}</span>
    </Link>
  );
}
