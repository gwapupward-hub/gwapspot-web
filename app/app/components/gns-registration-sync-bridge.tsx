"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import {
  GNS_PENDING_REGISTRATION_STORAGE_KEY,
  parsePendingGnsRegistration,
} from "../lib/gns-registration";
import { useGwapOs } from "./os-provider";

type SyncRegistration = {
  name: string;
  fullName: string;
  txSignature: string;
  network: "devnet" | "testnet" | "mainnet-beta";
  status: "submitted" | "indexing" | "active" | "failed";
  submittedAt: string;
  updatedAt: string;
  attempts: number;
  recovered: boolean;
  error: string | null;
};

type SyncPayload = {
  registration: SyncRegistration | null;
  error?: string;
};

const POLL_MS = 2_500;
const ACTIVE_REFRESH_DELAY_MS = 250;

function readLocalPending(owner: string) {
  try {
    const raw = window.localStorage.getItem(GNS_PENDING_REGISTRATION_STORAGE_KEY);
    if (!raw) return null;
    return parsePendingGnsRegistration(JSON.parse(raw) as unknown, owner);
  } catch {
    return null;
  }
}

function clearLocalPending(owner: string) {
  try {
    const raw = window.localStorage.getItem(GNS_PENDING_REGISTRATION_STORAGE_KEY);
    if (!raw) return;
    const value = JSON.parse(raw) as { owner?: unknown };
    if (value.owner === owner) {
      window.localStorage.removeItem(GNS_PENDING_REGISTRATION_STORAGE_KEY);
    }
  } catch {
    try {
      window.localStorage.removeItem(GNS_PENDING_REGISTRATION_STORAGE_KEY);
    } catch {
      // Local persistence is a recovery aid only.
    }
  }
}

export function GnsRegistrationSyncBridge() {
  const router = useRouter();
  const { getAccessToken } = usePrivy();
  const { account, gnsIdentity, updateGnsIdentity } = useGwapOs();
  const busyRef = useRef(false);
  const refreshedSignatureRef = useRef<string | null>(null);

  const authenticatedFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = await getAccessToken();
      const headers = new Headers(init?.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers, credentials: "same-origin" });
    },
    [getAccessToken],
  );

  const readServerStatus = useCallback(async () => {
    const response = await authenticatedFetch("/api/gns/registration-status", {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as SyncPayload;
    return payload.registration;
  }, [authenticatedFetch]);

  const trackLocalReceipt = useCallback(async () => {
    const pending = readLocalPending(account.verifiedWallet);
    if (!pending) return null;

    const response = await authenticatedFetch("/api/gns/registration-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "track",
        name: pending.name,
        txSignature: pending.signature,
        network: pending.config.network,
      }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as SyncPayload;
    return payload.registration;
  }, [account.verifiedWallet, authenticatedFetch]);

  const reconcile = useCallback(async () => {
    const response = await authenticatedFetch("/api/gns/registration-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reconcile" }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as SyncPayload;
    return payload.registration;
  }, [authenticatedFetch]);

  const finish = useCallback(
    (registration: SyncRegistration) => {
      if (refreshedSignatureRef.current === registration.txSignature) return;
      refreshedSignatureRef.current = registration.txSignature;
      clearLocalPending(account.verifiedWallet);
      updateGnsIdentity({
        status: "found",
        name: registration.name,
        fullName: registration.fullName,
      });
      window.setTimeout(() => router.refresh(), ACTIVE_REFRESH_DELAY_MS);
    },
    [account.verifiedWallet, router, updateGnsIdentity],
  );

  useEffect(() => {
    if (gnsIdentity.status === "found") {
      clearLocalPending(account.verifiedWallet);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof window.setTimeout> | null = null;

    const tick = async () => {
      if (cancelled || busyRef.current) return;
      busyRef.current = true;
      try {
        let registration = await readServerStatus();
        if (!registration) registration = await trackLocalReceipt();
        if (!registration || cancelled) return;

        if (registration.status === "active") {
          finish(registration);
          return;
        }
        if (registration.status === "failed") return;

        registration = await reconcile();
        if (registration?.status === "active" && !cancelled) {
          finish(registration);
        }
      } finally {
        busyRef.current = false;
        if (!cancelled) timer = window.setTimeout(tick, POLL_MS);
      }
    };

    timer = window.setTimeout(tick, 0);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [
    account.verifiedWallet,
    finish,
    gnsIdentity.status,
    readServerStatus,
    reconcile,
    trackLocalReceipt,
  ]);

  return null;
}
