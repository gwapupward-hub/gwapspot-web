"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  getTrustHomeActiveWork,
  type TrustHomeActiveWorkItem,
} from "../../lib/trust-home-active-work";

type WorkspacePayload = {
  projects?: { items?: unknown[] };
  error?: string;
};

type LoadState = "loading" | "ready" | "error";

export function TrustHomeActiveWork() {
  const { getAccessToken } = usePrivy();
  const [items, setItems] = useState<TrustHomeActiveWorkItem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  const authenticatedFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = await getAccessToken();
      const headers = new Headers(init?.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers, credentials: "same-origin" });
    },
    [getAccessToken],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await authenticatedFetch("/api/daily-ideas/workspace", {
          cache: "no-store",
        });
        const payload = (await response.json()) as WorkspacePayload;
        if (!response.ok) throw new Error(payload.error || "Active work could not load");
        if (!active) return;
        setItems(getTrustHomeActiveWork(payload.projects?.items));
        setLoadState("ready");
      } catch {
        if (active) setLoadState("error");
      }
    })();
    return () => {
      active = false;
    };
  }, [authenticatedFetch]);

  if (loadState === "loading") {
    return (
      <div className="gwapos-pulse" aria-live="polite">
        <div className="gwapos-pulse-row">
          <span aria-hidden="true">·</span>
          <div>
            <p>Loading active work</p>
            <small>Reading your current Daily Ideas project state.</small>
          </div>
          <strong>Syncing</strong>
        </div>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="gwapos-pulse">
        <Link className="gwapos-pulse-row" href="/app/ideas/lab">
          <span aria-hidden="true">↻</span>
          <div>
            <p>Active work is temporarily unavailable</p>
            <small>Open Idea Lab directly to continue your project work.</small>
          </div>
          <strong>Open</strong>
        </Link>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="gwapos-pulse">
        <Link className="gwapos-pulse-row" href="/app/ideas/lab/start">
          <span aria-hidden="true">+</span>
          <div>
            <p>Start your first project</p>
            <small>Turn an idea into structured work that GWAP can help you move forward.</small>
          </div>
          <strong>Start</strong>
        </Link>
      </div>
    );
  }

  return (
    <div className="gwapos-pulse">
      {items.map((item) => (
        <Link className="gwapos-pulse-row" href={item.href} key={item.id}>
          <span aria-hidden="true">✦</span>
          <div>
            <p>{item.title}</p>
            <small>{item.note}</small>
          </div>
          <strong>{item.stageLabel}</strong>
        </Link>
      ))}
    </div>
  );
}
