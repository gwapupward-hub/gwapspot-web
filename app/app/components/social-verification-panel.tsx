"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useMemo, useState } from "react";

type PlatformConfig = {
  platform: "x";
  label: string;
  officialHandle: string;
  verifierEnabled: boolean;
  challengeTtlMinutes: number;
};

type VerificationRecord = {
  platform: "x";
  socialHandle: string;
  challengeCode: string | null;
  status: "challenge-issued" | "awaiting-dm" | "verified" | "revoked" | "expired";
  issuedAt: string;
  expiresAt: string;
  verifiedAt: string | null;
  revokedAt: string | null;
};

type SocialVerificationPayload = {
  platforms: PlatformConfig[];
  records: VerificationRecord[];
  summary: {
    enabled: boolean;
    verifiedCount: number;
    pendingCount: number;
  };
};

function statusLabel(status: VerificationRecord["status"]) {
  if (status === "verified") return "VERIFIED";
  if (status === "awaiting-dm") return "AWAITING PLATFORM CONFIRMATION";
  if (status === "challenge-issued") return "CHALLENGE ISSUED";
  if (status === "expired") return "EXPIRED";
  return "REVOKED";
}

export function SocialVerificationPanel() {
  const { getAccessToken } = usePrivy();
  const [payload, setPayload] = useState<SocialVerificationPayload | null>(null);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const authenticatedFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = await getAccessToken();
      const headers = new Headers(init?.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers, credentials: "same-origin" });
    },
    [getAccessToken],
  );

  const load = useCallback(async () => {
    const response = await authenticatedFetch("/api/gwapscore/social-verification", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Verification status unavailable");
    const next = (await response.json()) as SocialVerificationPayload;
    setPayload(next);
    setUnavailable(false);
    return next;
  }, [authenticatedFetch]);

  useEffect(() => {
    let active = true;
    const initial = window.setTimeout(() => {
      void load().catch(() => {
        if (active) setUnavailable(true);
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(initial);
    };
  }, [load]);

  const platform = payload?.platforms.find((item) => item.platform === "x") ?? null;
  const record = payload?.records.find((item) => item.platform === "x") ?? null;
  const pending = record?.status === "challenge-issued" || record?.status === "awaiting-dm";

  useEffect(() => {
    if (!pending) return;
    const poll = window.setInterval(() => {
      void load().catch(() => undefined);
    }, 4_000);
    return () => window.clearInterval(poll);
  }, [load, pending]);

  const remaining = useMemo(() => {
    if (!record || !pending) return null;
    const ms = Date.parse(record.expiresAt) - Date.now();
    return Math.max(0, Math.ceil(ms / 60_000));
  }, [pending, record]);

  async function action(body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await authenticatedFetch("/api/gwapscore/social-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || "Verification action failed");
      await load();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Verification action failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function issueChallenge() {
    const ok = await action({ action: "issue", platform: "x", handle });
    if (ok) setHandle("");
  }

  async function copyChallenge() {
    if (!record?.challengeCode) return;
    try {
      await navigator.clipboard.writeText(record.challengeCode);
      setMessage("Challenge code copied.");
    } catch {
      setMessage("Copy failed. Select the challenge code manually.");
    }
  }

  if (unavailable) {
    return (
      <section className="os-runtime-panel os-runtime-note" id="social-verification">
        <span className="os-terminal-label">PROOF OF CONTROL</span>
        <h2>Social verification is temporarily unavailable.</h2>
        <p>This infrastructure state does not reduce your Trust Coverage or GwapScore.</p>
      </section>
    );
  }

  if (!payload || !platform) {
    return (
      <section className="os-runtime-panel os-runtime-note" id="social-verification" role="status">
        <span className="os-terminal-label">PROOF OF CONTROL</span>
        <h2>Loading social verification…</h2>
      </section>
    );
  }

  if (!platform.verifierEnabled) {
    return (
      <section className="os-runtime-panel os-runtime-note" id="social-verification">
        <span className="os-terminal-label">PROOF OF CONTROL · STAGED</span>
        <h2>Social verification is built but the platform verifier is not connected yet.</h2>
        <p>
          GWAP will only activate this feature when the signed platform bridge can independently confirm both the follow and the DM challenge. No username-only verification is accepted.
        </p>
      </section>
    );
  }

  if (record?.status === "verified") {
    return (
      <section className="os-runtime-panel os-runtime-note" id="social-verification">
        <span className="os-terminal-label">PROOF OF CONTROL · VERIFIED</span>
        <h2>@{record.socialHandle} is controlled by this GWAP account.</h2>
        <p>
          GWAP observed the challenge through the signed platform verifier after the required follow and DM flow. This relationship can now enter your Trust and Relationship Graphs as verified provenance.
        </p>
        <div className="os-inline-actions">
          <a href={`https://x.com/${record.socialHandle}`} target="_blank" rel="noreferrer">Open X account ↗</a>
          <button
            className="os-secondary-action"
            type="button"
            disabled={busy}
            onClick={() => void action({ action: "revoke", platform: "x" })}
          >
            Revoke verification
          </button>
        </div>
        {record.verifiedAt ? <small>Verified {new Date(record.verifiedAt).toLocaleString()}</small> : null}
        {message ? <p className="os-registration-output">› {message}</p> : null}
      </section>
    );
  }

  if (pending && record?.challengeCode) {
    return (
      <section className="os-runtime-panel os-runtime-note" id="social-verification" aria-live="polite">
        <span className="os-terminal-label">PROOF OF CONTROL · {statusLabel(record.status)}</span>
        <h2>Verify @{record.socialHandle} on {platform.label}.</h2>
        <p>
          1. Follow <a href={`https://x.com/${platform.officialHandle}`} target="_blank" rel="noreferrer">@{platform.officialHandle} ↗</a>. 2. From @{record.socialHandle}, DM the exact challenge below. 3. GWAP will confirm the platform event automatically.
        </p>
        <div className="os-identity-console">
          <div className="os-console-chrome"><span>ONE-TIME CHALLENGE</span><span>{remaining ?? platform.challengeTtlMinutes} MIN LEFT</span></div>
          <div className="os-identity-body">
            <div className="os-identity-copy">
              <span className="os-terminal-label">SEND EXACTLY</span>
              <h2>{record.challengeCode}</h2>
              <p>The challenge expires automatically and cannot verify a different social handle.</p>
            </div>
          </div>
        </div>
        <div className="os-inline-actions">
          <button className="os-secondary-action" type="button" onClick={() => void copyChallenge()}>Copy challenge</button>
          {record.status === "challenge-issued" ? (
            <button
              className="os-primary-action"
              type="button"
              disabled={busy}
              onClick={() => void action({ action: "mark-sent", platform: "x" })}
            >
              I sent the DM
            </button>
          ) : null}
          <button
            className="os-secondary-action"
            type="button"
            disabled={busy}
            onClick={() => void action({ action: "revoke", platform: "x" })}
          >
            Cancel challenge
          </button>
        </div>
        <p>
          {record.status === "awaiting-dm"
            ? "Waiting for the signed platform verifier. You can leave this page; GWAP will preserve the challenge until it expires."
            : "Mark the challenge as sent after you DM it. That action alone does not verify the account."}
        </p>
        {message ? <p className="os-registration-output">› {message}</p> : null}
      </section>
    );
  }

  return (
    <section className="os-runtime-panel os-runtime-note" id="social-verification">
      <span className="os-terminal-label">PROOF OF CONTROL · {platform.label.toUpperCase()}</span>
      <h2>Prove you control a social account.</h2>
      <p>
        Enter the handle you want attached to this GWAP identity. GWAP will issue a one-time challenge; verification completes only after the platform bridge confirms the required follow and DM.
      </p>
      <label className="os-field">
        <span>{platform.label} handle</span>
        <input
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          placeholder="yourhandle"
          autoComplete="off"
          inputMode="text"
        />
      </label>
      <div className="os-inline-actions">
        <button className="os-primary-action" type="button" disabled={busy || !handle.trim()} onClick={() => void issueChallenge()}>
          {busy ? "Creating challenge…" : "Start verification"}
        </button>
      </div>
      {record?.status === "expired" ? <p>Your previous challenge expired. Generate a new one when ready.</p> : null}
      {record?.status === "revoked" ? <p>Your previous social verification was revoked.</p> : null}
      {message ? <p className="os-registration-output">› {message}</p> : null}
    </section>
  );
}
