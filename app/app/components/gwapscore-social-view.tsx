"use client";

import Image from "next/image";
import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  VERIFICATION_CARD_THEMES,
  type SocialAccount,
  type SocialSummary,
  type VerificationCardTheme,
} from "../../lib/gwapscore-social/types";
import styles from "../score/score.module.css";

type ChallengePayload = {
  challengeId: string;
  challenge: string;
  cardTheme: VerificationCardTheme;
  verificationShareUrl: string;
  verificationPostText: string;
  postIntentUrl: string;
  expiresAt: string;
  account: SocialAccount;
};

type ChallengeStatusPayload = {
  account: SocialAccount;
  challenge: {
    id: string;
    cardTheme?: VerificationCardTheme;
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

const CARD_LABELS: Record<VerificationCardTheme, string> = {
  orange: "Orange",
  red: "Red",
  green: "Green",
  purple: "Purple",
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
  const [cardTheme, setCardTheme] = useState<VerificationCardTheme>("green");
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

  const challengeId = challenge?.challengeId ?? null;
  const challengeVerificationState = challenge?.account.verificationState ?? null;

  useEffect(() => {
    if (!challengeId || challengeVerificationState === "VERIFIED") return;
    let cancelled = false;

    const poll = async () => {
      try {
        const response = await authenticatedFetch(
          `/api/v1/gwapscore/social/challenges/${encodeURIComponent(challengeId)}`,
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
          setStatus(
            "Public proof matched. Follow the official GwapScore X account, then verification will complete on the next check.",
          );
        } else if (payload.verified || payload.account.verificationState === "VERIFIED") {
          setStatus("Proof of Control verified. No reputation score has been issued yet.");
          await loadSummary();
        }
      } catch {
        // Polling is best-effort; the next cycle or manual check can recover.
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 8_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [authenticatedFetch, challengeId, challengeVerificationState, loadSummary, readJson]);

  async function claimAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || busy) return;
    setBusy(true);
    setStatus("Resolving public X account…");
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
      const claimedAccount = payload.account;
      setSummary((current) => ({ ...current, accounts: [claimedAccount] }));
      setChallenge(null);
      setStatus("X account claimed. Choose a preview card before generating your proof post.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to claim X account.");
    } finally {
      setBusy(false);
    }
  }

  async function createChallenge() {
    if (!activeAccount || busy) return;
    setBusy(true);
    setStatus(`Generating ${CARD_LABELS[cardTheme]} Proof of Control post…`);
    try {
      const response = await authenticatedFetch("/api/v1/gwapscore/social/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          socialAccountId: activeAccount.id,
          cardTheme,
        }),
      });
      const payload = await readJson<ChallengePayload & ApiError>(response);
      if (!response.ok || !payload.challengeId || !payload.challenge) {
        throw new Error(payload.error || "Unable to create verification challenge.");
      }
      setChallenge(payload);
      setSummary((current) => ({ ...current, accounts: [payload.account] }));
      setStatus(
        `Your ${CARD_LABELS[payload.cardTheme]} preview is locked to this challenge. Publish the generated post on X; verification checks automatically.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create verification challenge.");
    } finally {
      setBusy(false);
    }
  }

  async function checkNow() {
    if (!challenge || busy) return;
    setBusy(true);
    setStatus("Checking your public X timeline for the proof post…");
    try {
      const response = await authenticatedFetch(
        `/api/v1/gwapscore/social/challenges/${encodeURIComponent(challenge.challengeId)}`,
        { method: "POST" },
      );
      const payload = await readJson<ChallengeStatusPayload & ApiError>(response);
      if (!response.ok) throw new Error(payload.error || "Unable to check verification.");
      setChallenge((current) => (current ? { ...current, account: payload.account } : current));
      if (payload.followRequired) {
        setStatus("Proof post matched. Follow the official GwapScore X account, then check again.");
      } else if (payload.verified || payload.account.verificationState === "VERIFIED") {
        setStatus("Proof of Control verified. No reputation score has been issued yet.");
        await loadSummary();
      } else {
        setStatus("Proof post not detected yet. Publish the generated post exactly, then check again.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to check verification.");
    } finally {
      setBusy(false);
    }
  }

  async function copyText(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(successMessage);
    } catch {
      setStatus("Copy failed. Select and copy the text manually.");
    }
  }

  const verified = activeAccount?.verificationState === "VERIFIED";
  const previewTheme = challenge?.cardTheme ?? cardTheme;

  return (
    <div className="os-page os-runtime-page">
      <header className="os-runtime-heading">
        <span className="os-terminal-label">~/score</span>
        <h1>Social reputation starts with proof.</h1>
        <p>
          GwapScore verifies control of your public social account first. Reputation scoring begins
          only after enough longitudinal public evidence exists.
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
              <p className={styles.helper}>
                Follower count does not verify ownership. GwapScore binds the claim to X&apos;s
                immutable user ID and reads only public account data.
              </p>
            </form>
          ) : (
            <div className={styles.accountCard}>
              <div>
                <span className={styles.platformBadge}>X</span>
                <h2>@{activeAccount.currentUsername}</h2>
                <p>{activeAccount.displayName || "X account"}</p>
              </div>
              <dl>
                <div>
                  <dt>Platform ID</dt>
                  <dd title={activeAccount.platformUserId}>
                    {shortPlatformId(activeAccount.platformUserId)}
                  </dd>
                </div>
                <div>
                  <dt>Control status</dt>
                  <dd>{accountStatusLabel(activeAccount)}</dd>
                </div>
                <div>
                  <dt>Follow check</dt>
                  <dd>{activeAccount.followStatus.replaceAll("_", " ")}</dd>
                </div>
              </dl>

              {!verified && !challenge ? (
                <div className={styles.cardPicker}>
                  <div className={styles.cardPickerHeader}>
                    <div>
                      <span>CHOOSE YOUR X PREVIEW</span>
                      <strong>{CARD_LABELS[cardTheme]}</strong>
                    </div>
                    <p>
                      Pick the card you want attached to your Proof of Control link before the post
                      is generated.
                    </p>
                  </div>

                  <div className={styles.cardGrid} role="radiogroup" aria-label="Proof card color">
                    {VERIFICATION_CARD_THEMES.map((theme) => (
                      <button
                        key={theme}
                        type="button"
                        role="radio"
                        aria-checked={cardTheme === theme}
                        data-selected={cardTheme === theme}
                        className={styles.cardOption}
                        onClick={() => setCardTheme(theme)}
                        disabled={busy}
                      >
                        <Image
                          src={`/verify/x/card/${theme}`}
                          width={1200}
                          height={600}
                          unoptimized
                          alt={`${CARD_LABELS[theme]} GWAP preview card`}
                          className={styles.cardArtwork}
                        />
                        <span>{CARD_LABELS[theme]}</span>
                      </button>
                    ))}
                  </div>

                  <p className={styles.aestheticNote}>
                    Color is aesthetic only. It has zero effect on verification, confidence, or any
                    current or future GwapScore calculation.
                  </p>

                  <button
                    className={styles.primaryButton}
                    type="button"
                    onClick={createChallenge}
                    disabled={busy}
                  >
                    Generate proof post with {CARD_LABELS[cardTheme]} card
                  </button>
                </div>
              ) : null}

              {challenge && !verified ? (
                <div className={styles.challengeBox}>
                  <span>SELECTED X PREVIEW · {CARD_LABELS[challenge.cardTheme].toUpperCase()}</span>
                  <Image
                    src={`/verify/x/card/${challenge.cardTheme}`}
                    width={1200}
                    height={600}
                    unoptimized
                    alt={`${CARD_LABELS[challenge.cardTheme]} GWAP Proof of Control preview`}
                    className={styles.lockedCardArtwork}
                  />
                  <strong>{challenge.challenge}</strong>
                  <p>
                    Publish the generated text from @{activeAccount.currentUsername}. The challenge
                    and card are locked together until this verification expires at{" "}
                    {new Date(challenge.expiresAt).toLocaleTimeString()}.
                  </p>

                  <pre className={styles.postPreview}>{challenge.verificationPostText}</pre>

                  <div className={styles.actionRow}>
                    <a
                      className={styles.primaryLink}
                      href={challenge.postIntentUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Post verification on X
                    </a>
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      onClick={() =>
                        void copyText(challenge.verificationPostText, "Verification post copied.")
                      }
                    >
                      Copy post text
                    </button>
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      onClick={() =>
                        void copyText(challenge.verificationShareUrl, "Proof link copied.")
                      }
                    >
                      Copy proof link
                    </button>
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      onClick={checkNow}
                      disabled={busy}
                    >
                      Check now
                    </button>
                  </div>

                  <div className={styles.liveRow}>
                    <i /> Automatic public-post check active
                  </div>
                  <p className={styles.aestheticNote}>
                    Want a different color? Let this challenge expire or generate a fresh Proof of
                    Control challenge; visual color never changes verification meaning.
                  </p>
                </div>
              ) : null}

              {verified ? (
                <div className={styles.verifiedBox}>
                  <strong>ACCOUNT VERIFIED</strong>
                  <p>
                    GwapScore has public evidence that this GWAP user controlled @
                    {activeAccount.currentUsername} at this point in time.
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </article>

        <aside className={`os-runtime-panel ${styles.sidePanel}`}>
          <span className="os-terminal-label">REPUTATION STATUS</span>
          <h2>{verified ? "Verified. Evidence comes next." : "No score by design."}</h2>
          <p>
            Sprint 1 does not manufacture a placeholder score. Verification proves control only; it
            does not mean trustworthy, popular, legitimate, or high reputation.
          </p>
          <div className={styles.metricGrid}>
            <div>
              <span>Official score</span>
              <strong>—</strong>
            </div>
            <div>
              <span>Confidence</span>
              <strong>—</strong>
            </div>
            <div>
              <span>Verified accounts</span>
              <strong>{summary.verifiedCount}</strong>
            </div>
          </div>
          <div className={styles.previewStatus}>
            <span>Current preview</span>
            <strong>{CARD_LABELS[previewTheme]}</strong>
            <small>Aesthetic only</small>
          </div>
          <div className={styles.statusLine}>{status}</div>
        </aside>
      </section>
    </div>
  );
}
