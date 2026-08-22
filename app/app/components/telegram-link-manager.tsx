"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type LinkSnapshot = {
  linked: boolean;
  identity: {
    telegramUserId: string;
    telegramUsername: string | null;
    telegramFirstName: string | null;
    telegramLastName: string | null;
    gnsIdentity: string | null;
    linkedAt: string;
  } | null;
  gwapIdentity: {
    accountId: string;
    gnsIdentity: string | null;
    primaryWallet: string;
  };
};

function compact(value: string) {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

export function TelegramLinkManager() {
  const params = useSearchParams();
  const router = useRouter();
  const { getAccessToken } = usePrivy();
  const visible = params.get("manageTelegram") === "1";
  const [snapshot, setSnapshot] = useState<LinkSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const authenticatedFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const token = await getAccessToken();
    const headers = new Headers(init?.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers, credentials: "same-origin" });
  }, [getAccessToken]);

  const load = useCallback(async () => {
    const response = await authenticatedFetch("/api/daily-ideas/link", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as (LinkSnapshot & { error?: string }) | null;
    if (!response.ok || !payload) throw new Error(payload?.error || "Telegram link status could not load.");
    setSnapshot(payload);
  }, [authenticatedFetch]);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => {
      void load().catch((cause) => {
        setError(cause instanceof Error ? cause.message : "Telegram link status could not load.");
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, visible]);

  async function unlink() {
    if (!snapshot?.linked || busy) return;
    const confirmed = window.confirm("Unlink this Telegram account from your GWAP account? Your GWAP-side Daily Ideas workspace, saved ideas, and projects will be preserved.");
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await authenticatedFetch("/api/daily-ideas/link", { method: "DELETE" });
      const payload = (await response.json().catch(() => null)) as { linked?: boolean; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Telegram unlink failed.");
      setNotice("Telegram unlinked. Your GWAP-side Daily Ideas workspace was preserved. Return to Telegram and use Link GWAP account to connect again.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Telegram unlink failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  const telegramName = snapshot?.identity?.telegramUsername
    ? `@${snapshot.identity.telegramUsername}`
    : snapshot?.identity
      ? [snapshot.identity.telegramFirstName, snapshot.identity.telegramLastName].filter(Boolean).join(" ") || `Telegram ${snapshot.identity.telegramUserId}`
      : "No Telegram account linked";

  return (
    <section className="os-runtime-panel os-runtime-note" style={{ marginBottom: 18 }} aria-label="Telegram account connection">
      <div className="os-console-chrome"><span>telegram.identity-link</span><span>{busy ? "UPDATING" : snapshot?.linked ? "CONNECTED" : "NOT LINKED"}</span></div>
      <span className="os-terminal-label">ACCOUNT LINK MANAGEMENT</span>
      <h2>Telegram ↔ GWAP OS</h2>
      <p>This panel shows the actual identity relationship stored by GWAP. Destructive changes require your authenticated GWAP OS session.</p>

      {snapshot ? (
        <div className="os-process-table">
          <div className="os-process-row os-process-head"><span>SIDE</span><span>IDENTITY</span><span>DETAIL</span></div>
          <div className="os-process-row"><span>Telegram</span><strong>{telegramName}</strong><span>{snapshot.identity ? `ID ${snapshot.identity.telegramUserId}` : "—"}</span></div>
          <div className="os-process-row"><span>GWAP</span><strong>{snapshot.gwapIdentity.gnsIdentity ? `${snapshot.gwapIdentity.gnsIdentity}.gwap` : compact(snapshot.gwapIdentity.accountId)}</strong><span>{compact(snapshot.gwapIdentity.primaryWallet)}</span></div>
          {snapshot.identity ? <div className="os-process-row"><span>Linked</span><strong>{new Date(snapshot.identity.linkedAt).toLocaleString()}</strong><span>Proofed account relationship</span></div> : null}
        </div>
      ) : <p>Loading connection details…</p>}

      {snapshot?.linked ? (
        <div className="os-inline-actions">
          <button type="button" className="os-secondary-action" disabled={busy} onClick={() => void unlink()}>{busy ? "Unlinking…" : "Unlink Telegram"}</button>
          <button type="button" className="os-secondary-action" onClick={() => router.replace("/app/ideas")}>Keep connection</button>
        </div>
      ) : (
        <div className="os-inline-actions">
          <button type="button" className="os-primary-action" onClick={() => router.replace("/app/ideas")}>Done</button>
        </div>
      )}

      {snapshot?.linked ? <p><strong>Relink to another GWAP account:</strong> unlink here, sign into the intended GWAP account, then return to Telegram and choose <strong>Link GWAP account</strong>. GWAP will issue a new short-lived link request instead of silently moving the identity.</p> : null}
      {notice ? <p className="os-registration-output" role="status">› {notice}</p> : null}
      {error ? <p className="os-runtime-warning" role="alert">{error}</p> : null}
    </section>
  );
}
