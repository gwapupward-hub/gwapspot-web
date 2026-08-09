"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useGwapOs } from "./os-provider";

type SearchState =
  | { status: "idle"; message: string }
  | { status: "checking"; message: string }
  | { status: "available"; message: string }
  | { status: "taken"; message: string }
  | { status: "error"; message: string };

export function IdentityView() {
  const { account, gnsIdentity } = useGwapOs();
  const [name, setName] = useState("");
  const [search, setSearch] = useState<SearchState>({ status: "idle", message: "Enter a .gwap name to query the registry." });

  async function checkName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = name.trim().toLowerCase().replace(/\.gwap$/, "");
    if (!candidate) return;
    setSearch({ status: "checking", message: `checking ${candidate}.gwap...` });
    try {
      const response = await fetch(`/api/gns/resolve?name=${encodeURIComponent(candidate)}`, { credentials: "same-origin" });
      const payload = (await response.json()) as { available?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || "Registry request failed");
      setSearch(payload.available
        ? { status: "available", message: `${candidate}.gwap → AVAILABLE` }
        : { status: "taken", message: `${candidate}.gwap → TAKEN` });
    } catch (error) {
      setSearch({ status: "error", message: error instanceof Error ? error.message : "Registry request failed" });
    }
  }

  if (gnsIdentity.status === "found") {
    return (
      <div className="os-page os-runtime-page">
        <header className="os-runtime-heading"><span className="os-terminal-label">~/identity</span><h1>Identity mounted.</h1><p>Your connected wallet reverse-resolved to an active GNS profile.</p></header>
        <section className="os-runtime-grid">
          <article className="os-runtime-panel os-profile-terminal">
            <div className="os-v2-avatar" aria-hidden="true">{(gnsIdentity.name || "G").slice(0, 1).toUpperCase()}</div>
            <div><span className="os-terminal-label">PRIMARY NAME</span><h2>{gnsIdentity.fullName}</h2><p>{gnsIdentity.bio || "No public bio published."}</p></div>
            <dl>
              <div><dt>Wallet</dt><dd>{account.verifiedWallet}</dd></div>
              <div><dt>Verified</dt><dd>{gnsIdentity.verified ? "YES" : "PENDING"}</dd></div>
              <div><dt>GwapScore</dt><dd>{gnsIdentity.score ?? "UNAVAILABLE"}</dd></div>
              <div><dt>Score tier</dt><dd>{gnsIdentity.scoreTier || "UNSET"}</dd></div>
            </dl>
            <div className="os-inline-actions">{gnsIdentity.profileUrl ? <a href={gnsIdentity.profileUrl} target="_blank" rel="noreferrer">Open public profile ↗</a> : null}<a href="https://gwapspot.fun/" target="_blank" rel="noreferrer">Manage in GNS ↗</a></div>
          </article>
          <aside className="os-runtime-panel os-runtime-note"><span className="os-terminal-label">PROFILE PIPELINE</span><h2>GNS is the source of truth.</h2><p>GWAP OS reads the active .gwap identity and score without blocking entry if the registry slows down.</p><code>wallet → /domains/:wallet → /profile/:name → OS</code></aside>
        </section>
      </div>
    );
  }

  return (
    <div className="os-page os-runtime-page">
      <header className="os-runtime-heading"><span className="os-terminal-label">~/identity/init</span><h1>System Initialization.</h1><p>{gnsIdentity.status === "none" ? "No .gwap profile was detected for this wallet." : "The GNS lookup timed out. GWAP OS entered limited mode instead of blocking you."}</p></header>
      <section className="os-runtime-grid">
        <article className="os-runtime-panel">
          <div className="os-console-chrome"><span>gns.search</span><span>{search.status.toUpperCase()}</span></div>
          <form className="os-name-search" onSubmit={checkName}>
            <label htmlFor="gwap-name">Desired identity</label>
            <div><span>$ lookup</span><input id="gwap-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="yourname" autoComplete="off" /><strong>.gwap</strong></div>
            <button type="submit" disabled={search.status === "checking"}>{search.status === "checking" ? "Checking..." : "Check availability"}</button>
          </form>
          <p className={`os-search-output state-${search.status}`}><span>›</span> {search.message}</p>
          {search.status === "available" ? <a className="os-primary-action" href="https://gwapspot.fun/" target="_blank" rel="noreferrer">Continue to GNS registration ↗</a> : null}
        </article>
        <aside className="os-runtime-panel os-runtime-note"><span className="os-terminal-label">INITIALIZATION STATUS</span><h2>Safe handoff enabled.</h2><p>Name availability is live. Minting and profile writes remain inside the existing GNS transaction flow until its signed write API is mounted directly into GWAP OS.</p><Link href="/app">Return to workspace</Link></aside>
      </section>
    </div>
  );
}
