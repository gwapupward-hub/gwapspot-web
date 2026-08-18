"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { GwapScoreResult } from "../lib/gwap-score";
import {
  buildPublicLookupShareUrl,
  readPublicLookupDeepLink,
} from "../lib/public-share";
import { GwapScoreDisplay } from "./gwap-score-display";

type PublicLookupMode = "wallet" | "name";

const GNS_NAME_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const IDENTITY_RECOVERY_DELAYS_MS = [1_200, 5_000] as const;

function getValidationMessage(mode: PublicLookupMode, value: string) {
  const input = value.trim();
  if (mode === "wallet") {
    return SOLANA_ADDRESS_PATTERN.test(input)
      ? ""
      : "Enter a valid Solana wallet address.";
  }

  const name = input.toLowerCase().replace(/\.gwap$/, "");
  return GNS_NAME_PATTERN.test(name)
    ? ""
    : "Use 1–32 letters, numbers, or internal hyphens.";
}

function shortAddress(value: string) {
  return value.length > 11
    ? `${value.slice(0, 6)}…${value.slice(-4)}`
    : value;
}

type NameResult = {
  kind: "name";
  name: string;
  fullName: string;
  available: boolean;
  owner: string | null;
  profileUrl: string | null;
  score: GwapScoreResult | null;
};

type WalletResult = {
  kind: "wallet";
  wallet: string;
  identity: {
    status: "found" | "none" | "unavailable";
    name: string | null;
    fullName: string | null;
    score: number | null;
    scoreTier: GwapScoreResult["tier"];
    scoreStatus: GwapScoreResult["status"];
    scoreMessage: string;
    verified: boolean;
    profileUrl: string | null;
  };
};

type LookupResult = NameResult | WalletResult;
type LookupStatus = "idle" | "loading" | "success" | "error";
type ShareStatus = "idle" | "sharing" | "copied" | "shared" | "error";

type ResultCardActions = {
  onShare: () => void;
  shareStatus: ShareStatus;
};

function ShareButton({ onShare, shareStatus }: ResultCardActions) {
  const labels: Record<ShareStatus, string> = {
    idle: "Share result",
    sharing: "Opening…",
    copied: "Link copied",
    shared: "Shared",
    error: "Try again",
  };

  return (
    <button
      className="hero-utility-share"
      type="button"
      disabled={shareStatus === "sharing"}
      onClick={onShare}
    >
      {labels[shareStatus]} <span aria-hidden="true">↗</span>
    </button>
  );
}

function getShareCopy(result: LookupResult) {
  if (result.kind === "name") {
    return result.available
      ? {
          title: `${result.fullName} is available`,
          text: `${result.fullName} is available on GNS. Check it on GWAP.`,
        }
      : {
          title: `${result.fullName} on GNS`,
          text: `${result.fullName} is registered with GwapScore ${result.score?.score ?? (result.score?.status === "unscored" ? "Unscored" : "Unavailable")}.`,
        };
  }

  if (result.identity.status !== "found") {
    return {
      title: "GWAP wallet result",
      text: `${shortAddress(result.wallet)} · GwapScore ${result.identity.score ?? (result.identity.scoreStatus === "unscored" ? "Unscored" : "Unavailable")}.`,
    };
  }

  return {
    title: `${result.identity.fullName || "GWAP identity"} reputation result`,
    text: `${result.identity.fullName || shortAddress(result.wallet)} · GwapScore ${result.identity.score ?? "unscored"} · ${result.identity.scoreTier || "public"}.`,
  };
}

function NameResultCard({
  result,
  onShare,
  shareStatus,
}: { result: NameResult } & ResultCardActions) {
  if (result.available) {
    return (
      <div className="hero-utility-result is-positive">
        <div>
          <small>AVAILABLE</small>
          <strong>{result.fullName} is ready.</strong>
          <p>Claim it inside GWAP OS and turn it into your identity hub.</p>
        </div>
        <div className="hero-utility-result-actions">
          <Link href={`/app/identity?name=${encodeURIComponent(result.name)}`}>
            Claim name <span aria-hidden="true">↗</span>
          </Link>
          <ShareButton onShare={onShare} shareStatus={shareStatus} />
        </div>
      </div>
    );
  }

  return (
    <div className="hero-utility-result">
      <div>
        <small>REGISTERED</small>
        <strong>{result.fullName} is active.</strong>
        <p>
          {result.owner
            ? `Owner ${shortAddress(result.owner)}`
            : "Registry ownership confirmed."}
        </p>
        {result.score ? <GwapScoreDisplay result={result.score} variant="card" /> : null}
      </div>
      <div className="hero-utility-result-actions">
        {result.profileUrl ? (
          <a href={result.profileUrl} target="_blank" rel="noreferrer">
            View profile <span aria-hidden="true">↗</span>
          </a>
        ) : null}
        <ShareButton onShare={onShare} shareStatus={shareStatus} />
      </div>
    </div>
  );
}

function WalletResultCard({
  result,
  onShare,
  shareStatus,
}: { result: WalletResult } & ResultCardActions) {
  const { identity } = result;

  const score: GwapScoreResult = {
    status: identity.scoreStatus,
    score: identity.score,
    tier: identity.scoreTier,
    message: identity.scoreMessage,
  };

  if (identity.status !== "found") {
    return (
      <div className="hero-utility-result">
        <div>
          <small>WALLET FOUND</small>
          <strong>
            {identity.status === "none"
              ? "No .gwap identity is linked yet."
              : "GwapScore ready. Reconnecting to GNS…"}
          </strong>
          <p>
            {identity.status === "unavailable"
              ? `${shortAddress(result.wallet)} was scored while GWAP retries the identity lookup.`
              : `${shortAddress(result.wallet)} was checked directly with GwapScore.`}
          </p>
          <GwapScoreDisplay result={score} variant="card" />
        </div>
        <div className="hero-utility-result-actions">
          {identity.status === "none" ? (
            <Link href="/app/identity">
              Initialize <span aria-hidden="true">↗</span>
            </Link>
          ) : null}
          <ShareButton onShare={onShare} shareStatus={shareStatus} />
        </div>
      </div>
    );
  }

  return (
    <div className="hero-utility-result is-positive">
      <div className="hero-utility-identity">
        <small>IDENTITY + REPUTATION SIGNAL</small>
        <strong>{identity.fullName || shortAddress(result.wallet)}</strong>
        <GwapScoreDisplay result={score} variant="card" />
        <dl>
          <div>
            <dt>Status</dt>
            <dd>{identity.verified ? "Verified" : "Public"}</dd>
          </div>
        </dl>
      </div>
      <div className="hero-utility-result-actions">
        {identity.profileUrl ? (
          <a href={identity.profileUrl} target="_blank" rel="noreferrer">
            Open profile <span aria-hidden="true">↗</span>
          </a>
        ) : null}
        <ShareButton onShare={onShare} shareStatus={shareStatus} />
      </div>
    </div>
  );
}

export function HomeUtility() {
  const [mode, setMode] = useState<PublicLookupMode>("wallet");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LookupStatus>("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [shareStatus, setShareStatus] = useState<ShareStatus>("idle");
  const controllerRef = useRef<AbortController | null>(null);
  const recoveryControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shareResetRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      recoveryControllerRef.current?.abort();
      if (shareResetRef.current) window.clearTimeout(shareResetRef.current);
    },
    [],
  );

  const recoverUnavailableIdentity = useCallback(async (wallet: string) => {
    recoveryControllerRef.current?.abort();
    const controller = new AbortController();
    recoveryControllerRef.current = controller;

    try {
      for (const delayMs of IDENTITY_RECOVERY_DELAYS_MS) {
        await new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, delayMs);
          controller.signal.addEventListener(
            "abort",
            () => {
              window.clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });

        if (controller.signal.aborted) return;

        try {
          const response = await fetch(
            `/api/public/lookup?type=wallet&q=${encodeURIComponent(wallet)}`,
            { signal: controller.signal, headers: { Accept: "application/json" } },
          );
          const payload = (await response.json().catch(() => ({}))) as
            | LookupResult
            | { error?: string };

          if (
            !response.ok ||
            !("kind" in payload) ||
            payload.kind !== "wallet"
          ) {
            continue;
          }

          if (controller.signal.aborted) return;

          if (payload.identity.status !== "unavailable") {
            setResult(payload);
            return;
          }
        } catch {
          if (controller.signal.aborted) return;
        }
      }
    } finally {
      if (recoveryControllerRef.current === controller) {
        recoveryControllerRef.current = null;
      }
    }
  }, []);

  const runLookup = useCallback(async (
    nextMode: PublicLookupMode,
    nextQuery: string,
    syncUrl = true,
  ) => {
    controllerRef.current?.abort();
    recoveryControllerRef.current?.abort();
    recoveryControllerRef.current = null;

    const validationMessage = getValidationMessage(nextMode, nextQuery);
    if (validationMessage) {
      setResult(null);
      setStatus("error");
      setMessage(validationMessage);
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus("loading");
    setMessage("");
    setResult(null);
    setShareStatus("idle");

    try {
      const response = await fetch(
        `/api/public/lookup?type=${nextMode}&q=${encodeURIComponent(nextQuery.trim())}`,
        { signal: controller.signal, headers: { Accept: "application/json" } },
      );
      const payload = (await response.json().catch(() => ({}))) as
        | LookupResult
        | { error?: string };

      if (!response.ok || !("kind" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "The lookup could not be completed.",
        );
      }

      setResult(payload);
      setStatus("success");
      if (payload.kind === "wallet" && payload.identity.status === "unavailable") {
        void recoverUnavailableIdentity(payload.wallet);
      }
      if (syncUrl) {
        const shareQuery = payload.kind === "name" ? payload.fullName : payload.wallet;
        const shareUrl = new URL(
          buildPublicLookupShareUrl(window.location.origin, payload.kind, shareQuery),
        );
        window.history.replaceState(
          window.history.state,
          "",
          `${shareUrl.pathname}${shareUrl.search}${shareUrl.hash}`,
        );
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "The lookup could not be completed.",
      );
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    }
  }, [recoverUnavailableIdentity]);

  useEffect(() => {
    const deepLink = readPublicLookupDeepLink(window.location.href);
    if (!deepLink || getValidationMessage(deepLink.mode, deepLink.query)) return;

    const frame = requestAnimationFrame(() => {
      setMode(deepLink.mode);
      setQuery(deepLink.query);
      void runLookup(deepLink.mode, deepLink.query, false);
    });
    return () => cancelAnimationFrame(frame);
  }, [runLookup]);

  function selectMode(nextMode: PublicLookupMode) {
    controllerRef.current?.abort();
    recoveryControllerRef.current?.abort();
    recoveryControllerRef.current = null;
    setMode(nextMode);
    setQuery("");
    setStatus("idle");
    setMessage("");
    setResult(null);
    setShareStatus("idle");

    const url = new URL(window.location.href);
    url.searchParams.delete("lookup");
    url.searchParams.delete("q");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runLookup(mode, query);
  }

  function setTransientShareStatus(nextStatus: ShareStatus) {
    setShareStatus(nextStatus);
    if (shareResetRef.current) window.clearTimeout(shareResetRef.current);
    shareResetRef.current = window.setTimeout(() => {
      setShareStatus("idle");
      shareResetRef.current = null;
    }, 2_400);
  }

  async function shareResult() {
    if (!result) return;

    const shareQuery = result.kind === "name" ? result.fullName : result.wallet;
    const shareUrl = buildPublicLookupShareUrl(
      window.location.origin,
      result.kind,
      shareQuery,
    );
    const shareCopy = getShareCopy(result);
    setShareStatus("sharing");

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ ...shareCopy, url: shareUrl });
        setTransientShareStatus("shared");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setShareStatus("idle");
          return;
        }
      }
    }

    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(shareUrl);
      setTransientShareStatus("copied");
    } catch {
      setTransientShareStatus("error");
    }
  }

  return (
    <section className="hero-utility" aria-labelledby="hero-utility-title">
      <div className="hero-utility-reflection" aria-hidden="true" />
      <div className="hero-utility-heading">
        <div>
          <small>LIVE GWAP UTILITY</small>
          <strong id="hero-utility-title">Check the network.</strong>
        </div>
        <span>NO SIGNUP</span>
      </div>

      <div className="hero-utility-tabs" role="group" aria-label="Lookup type">
        <button
          type="button"
          aria-pressed={mode === "wallet"}
          onClick={() => selectMode("wallet")}
        >
          Wallet Intelligence
        </button>
        <button
          type="button"
          aria-pressed={mode === "name"}
          onClick={() => selectMode("name")}
        >
          .GWAP Name
        </button>
      </div>

      <div>
        <form className="hero-utility-form" onSubmit={submitLookup}>
          <label className="sr-only" htmlFor="hero-utility-input">
            {mode === "wallet"
              ? "Solana wallet address"
              : "GWAP name"}
          </label>
          <input
            ref={inputRef}
            id="hero-utility-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              mode === "wallet"
                ? "Enter a Solana wallet address..."
                : "Find yourname.gwap..."
            }
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            disabled={status === "loading"}
          />
          <button
            type="submit"
            disabled={status === "loading"}
            aria-label={
              status === "loading"
                ? "Checking the GWAP network"
                : "Run lookup"
            }
          >
            {status === "loading" ? <i aria-hidden="true" /> : <span aria-hidden="true">→</span>}
          </button>
        </form>
      </div>

      <div className="hero-utility-feedback" aria-live="polite">
        {status === "loading" ? <p>Querying the GWAP network…</p> : null}
        {status === "error" ? <p className="is-error">{message}</p> : null}
        {status === "success" && result?.kind === "name" ? (
          <NameResultCard
            result={result}
            onShare={shareResult}
            shareStatus={shareStatus}
          />
        ) : null}
        {status === "success" && result?.kind === "wallet" ? (
          <WalletResultCard
            result={result}
            onShare={shareResult}
            shareStatus={shareStatus}
          />
        ) : null}
      </div>

      <footer>
        <span><i /> No signup required</span>
        <span>Powered by GWAP</span>
      </footer>
    </section>
  );
}
