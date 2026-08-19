"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { SocialAccount, SocialSummary } from "../../lib/gwapscore-social/types";
import styles from "../score/score.module.css";

type ChallengePayload = {
  challengeId: string;
  challenge: string;
  expiresAt: string;
  account: SocialAccount;
};

type ChallengeStatusPayload = {
  account: SocialAccount;
  challenge: {
    id: string;
    state: "active" | "consumed" | "expired" | "revoked";
    expiresAt: string;
  };
  matched?: boolean;
  followRequired?: boolean;
  verified?: boolean;
};

type ApiError = { error?: string };

const EMPTY_SUMMARY: SocialSummary = {
  accounts: [],
  verifiedCount: 0,
  scoreStatus: "NOT_STARTED",
  score: null,
  confidence: null,
};

function accountStatusLabel(account: SocialAccount) {
  return account.verificationState.replaceAll("_", " ");
}

function shortPlatformId(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function GwapScoreSocialView() {
  const { getAccessToken } = usePrivy();
  const [summary, setSummary] = useState<SocialSummary>(EMPTY_SUMMARY);
  const [username, setUsername] = useState("");
  const [challenge, setChallenge] = useState<ChallengePayload | null>(null);
  const [status, setStatus] = useState("Loading GwapScore Social…");
  const [busy, setBusy] = useState(false);

  const authenticatedFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = await getAccessToken();
      const headers = new Headers(init?.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return fetch(input, { ...init, headers, credentials: "same-origin" });
    },
    [getAccessToken],
  );

  const readJson = useCallback(async <T,>(response: Response) => {
    try {
      return (await response.json()) as T;
    } catch {
      return {} as T;
    }
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      const response = await authenticatedFetch("/api/v1/gwapscore/social", {
        cache: "no-store",
      });
      const payload = await readJson<SocialSummary & ApiError>(response);
      if (!response.ok) throw new Error(payload.error || "Unable to load GwapScore Social.");
      setSummary(payload);
      setStatus(
        payload.accounts.length
          ? "Server-authoritative social identity loaded."
          : "Connect an X account to begin Proof of Control.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load GwapScore Social.");
    }
  }, [authenticatedFetch, readJson]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const activeAccount = useMemo(
    () => summary.accounts.find((account) => account.platform === "x") ?? null,
    [summary.accounts],
  );

  useEffect(() => {
    if (!challenge || challenge.account.verificationState === "VERIFIED") return;
    let cancelled = false;

    const poll = async () => {
      try {
        const response = await authenticatedFetch(
          `/api/v1/gwapscore/social/challenges/${encodeURIComponent(challenge.challengeId)}`,
          { method: "POST" },
        );
        const payload = await readJson<ChallengeStatusPayload & ApiError>(response);
        if (cancelled) return;
        if (!response.ok) {
          if (response.status === 404) {
            setChallenge(null);
            await loadSummary();
          }
          return;
        }
        setChallenge((current) => (current ? { ...current, account: payload.account } : current));
        if (payload.followRequired) {
          setStatus("DM matched. Follow the official GwapScore X account, then verification will complete on the next check.");
        } else if (payload.verified || payload.account.verificationState === "VERIFIED") {
          setStatus("Proof of Control verified. No reputation score has been issued yet.");
          await loadSummary();
        }
      } catch {
        // Polling is best-effort; the next cycle or manual reload can recover.
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 8_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authenticatedFetch, challenge?.challengeId, challenge?.account.verificationState, loadSummary, readJson]);

  async function claimAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || busy) return;
    setBusy(true);
    setStatus("Resolving X account…");
    try {
      const response = await authenticatedFetch("/api/v1/gwapscore/social/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "x", username }),
      });
      const payload = await readJson<{ account?: SocialAccount } & ApiError>(response);
      if (!response.ok || !payload.account) {
        throw new Error(payload.error || "Unable to claim X account.");
      }
      setSummary((current) => ({ ...current, accounts: [payload.account!] }));
      setStatus("X account claimed. Generate a one-time Proof of Control challenge next.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to claim X account.");
    } finally {
      setBusy(false);
    }
  }

  async function createChallenge() {
    if (!activeAccount || busy) return;
    setBusy(true);
    setStatus("Generating secure one-time challenge…");
    try {
      const response = await authenticatedFetch("/api/v1/gwapscore/social/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ socialAccountId: activeAccount.id }),
      });
      const payload = await readJson<ChallengePayload & ApiError>(response);
      if (!response.ok || !payload.challengeId || !payload.challenge) {
        throw new Error(payload.error || "Unable to create verification challenge.");
      }
      setChallenge(payload);
      setSummary((current) => ({ ...current, accounts: [payload.account] }));
      setStatus("Send this exact challenge by DM from the claimed X account. Verification checks automatically.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create verification challenge.");
    } finally {
      setBusy(false);
    }
  }

  const verified = activeAccount?.verificationState === "VERIFIED";

  return (
    <div className="os-page os-runtime-page">
      <header className="os-runtime-heading">
        <span className="os-terminal-label">~/score</span>
        <h1>Social reputation starts with proof.</h1>
        <p>
          GwapScore verifies control of your social account first. Reputation scoring begins only after enough longitudinal public evidence exists.
        </p>
      </header>

      <section className="os-runtime-grid">
        <article className={`os-runtime-panel ${styles.primaryPanel}`}>
          <div className={styles.kicker}>GWAPSCORE SOCIAL · X FIRST</div>
          {!activeAccount ? (
            <form className={styles.form} onSubmit={claimAccount}>
              <label htmlFor="gwapscore-x-username">X username</label>
              <div className={styles.inputRow}>
                <input
                  id="gwapscore-x-username"
                  name="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value.slice(0, 16))}
                  placeholder="@yourhandle"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={busy}
                />
                <button type="submit" disabled={busy || !username.trim()}>
                  Claim X account
                </button>
              </div>
              <p className={styles.helper}>Follower count does not verify ownership. GwapScore binds the claim to X&apos;s immutable user ID.</p>
            </form>
          ) : (
            <div className={styles.accountCard}>
              <div>
                <span className={styles.platformBadge}>X</span>
                <h2>@{activeAccount.currentUsername}</h2>
                <p>{activeAccount.displayName || "X account"}</p>
              </div>
              <dl>
                <div><dt>Platform ID</dt><dd title={activeAccount.platformUserId}>{shortPlatformId(activeAccount.platformUserId)}</dd></div>
                <div><dt>Control status</dt><dd>{accountStatusLabel(activeAccount)}</dd></div>
                <div><dt>Follow check</dt><dd>{activeAccount.followStatus.replaceAll("_", " ")}</dd></div>
              </dl>

              {!verified && !challenge ? (
                <button className={styles.primaryButton} type="button" onClick={createChallenge} disabled={busy}>
                  Generate Proof of Control
                </button>
              ) : null}

              {challenge && !verified ? (
                <div className={styles.challengeBox}>
                  <span>ONE-TIME CHALLENGE</span>
                  <strong>{challenge.challenge}</strong>
                  <p>DM this exact code to the official GwapScore X account from @{activeAccount.currentUsername}. It expires at {new Date(challenge.expiresAt).toLocaleTimeString()}.</p>
                  <div className={styles.liveRow}><i /> Automatic DM check active</div>
                </div>
              ) : null}

              {verified ? (
                <div className={styles.verifiedBox}>
                  <strong>ACCOUNT VERIFIED</strong>
                  <p>GwapScore has evidence that this GWAP user controlled @{activeAccount.currentUsername} at this point in time.</p>
                </div>
              ) : null}
            </div>
          )}
        </article>

        <aside className={`os-runtime-panel ${styles.sidePanel}`}>
          <span className="os-terminal-label">REPUTATION STATUS</span>
          <h2>{verified ? "Verified. Evidence comes next." : "No score by design."}</h2>
          <p>
            Sprint 1 does not manufacture a 300-point placeholder. Verification proves control only; it does not mean trustworthy, popular, legitimate, or high reputation.
          </p>
          <div className={styles.metricGrid}>
            <div><span>Official score</span><strong>—</strong></div>
            <div><span>Confidence</span><strong>—</strong></div>
            <div><span>Verified accounts</span><strong>{summary.verifiedCount}</strong></div>
          </div>
          <div className={styles.statusLine}>{status}</div>
        </aside>
      </section>
    </div>
  );
}
