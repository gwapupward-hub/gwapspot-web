"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

type PublicLookupMode = "wallet" | "name";

const GNS_NAME_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

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
    : "Use 1–40 letters, numbers, or internal hyphens.";
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
};

type WalletResult = {
  kind: "wallet";
  wallet: string;
  identity: {
    status: "found" | "none";
    name: string | null;
    fullName: string | null;
    score: number | null;
    scoreTier: string | null;
    verified: boolean;
    profileUrl: string | null;
  };
};

type LookupResult = NameResult | WalletResult;
type LookupStatus = "idle" | "loading" | "success" | "error";

function NameResultCard({ result }: { result: NameResult }) {
  if (result.available) {
    return (
      <div className="hero-utility-result is-positive">
        <div>
          <small>AVAILABLE</small>
          <strong>{result.fullName} is ready.</strong>
          <p>Claim it inside GWAP OS and turn it into your identity hub.</p>
        </div>
        <Link href={`/app/identity?name=${encodeURIComponent(result.name)}`}>
          Claim name <span aria-hidden="true">↗</span>
        </Link>
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
      </div>
      {result.profileUrl ? (
        <a href={result.profileUrl} target="_blank" rel="noreferrer">
          View profile <span aria-hidden="true">↗</span>
        </a>
      ) : null}
    </div>
  );
}

function WalletResultCard({ result }: { result: WalletResult }) {
  const { identity } = result;

  if (identity.status === "none") {
    return (
      <div className="hero-utility-result">
        <div>
          <small>WALLET FOUND</small>
          <strong>No .gwap identity is linked yet.</strong>
          <p>{shortAddress(result.wallet)} can initialize one inside GWAP OS.</p>
        </div>
        <Link href="/app/identity">
          Initialize <span aria-hidden="true">↗</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="hero-utility-result is-positive">
      <div className="hero-utility-identity">
        <small>IDENTITY + REPUTATION SIGNAL</small>
        <strong>{identity.fullName || shortAddress(result.wallet)}</strong>
        <dl>
          <div>
            <dt>GwapScore</dt>
            <dd>{identity.score ?? "—"}</dd>
          </div>
          <div>
            <dt>Tier</dt>
            <dd>{identity.scoreTier || "—"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{identity.verified ? "Verified" : "Public"}</dd>
          </div>
        </dl>
      </div>
      {identity.profileUrl ? (
        <a href={identity.profileUrl} target="_blank" rel="noreferrer">
          Open profile <span aria-hidden="true">↗</span>
        </a>
      ) : null}
    </div>
  );
}

export function HomeUtility() {
  const [mode, setMode] = useState<PublicLookupMode>("wallet");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<LookupStatus>("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  function selectMode(nextMode: PublicLookupMode) {
    controllerRef.current?.abort();
    setMode(nextMode);
    setQuery("");
    setStatus("idle");
    setMessage("");
    setResult(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    controllerRef.current?.abort();

    const validationMessage = getValidationMessage(mode, query);
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

    try {
      const response = await fetch(
        `/api/public/lookup?type=${mode}&q=${encodeURIComponent(query.trim())}`,
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
          <NameResultCard result={result} />
        ) : null}
        {status === "success" && result?.kind === "wallet" ? (
          <WalletResultCard result={result} />
        ) : null}
      </div>

      <footer>
        <span><i /> No signup required</span>
        <span>Powered by GWAP</span>
      </footer>
    </section>
  );
}
