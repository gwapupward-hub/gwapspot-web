"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PpvDeliverableAnchor } from "../../components/ppv/ppv-deliverable-anchor";
import { buildMarketplaceCollaborationPacket } from "../../lib/marketplace-collaboration-packet";
import "../../components/ppv/ppv.css";
import { useGwapOs } from "../components/os-provider";
import type { MarketplaceRole } from "../lib/os-state";

const roleLabels: Record<MarketplaceRole, string> = {
  developer: "Developer",
  designer: "Designer",
  marketer: "Marketer",
  researcher: "Researcher",
  operations: "Operations",
};

type PacketCopyStatus = "idle" | "copied" | "manual" | "error";

function compactWallet(wallet: string) {
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

export default function MarketplacePage() {
  const {
    account,
    gnsIdentity,
    migrationAvailable,
    removeMarketplaceIntent,
    state,
    syncStatus,
    updateMarketplaceIntent,
  } = useGwapOs();
  const [selectedId, setSelectedId] = useState(state.marketplaceIntents[0]?.id ?? "");
  const [packetCopyStatus, setPacketCopyStatus] = useState<PacketCopyStatus>("idle");
  const selected = useMemo(
    () => state.marketplaceIntents.find((intent) => intent.id === selectedId) ?? state.marketplaceIntents[0] ?? null,
    [selectedId, state.marketplaceIntents],
  );
  const project = selected ? state.ideaProjects.find((item) => item.id === selected.projectId) ?? null : null;
  const owner = gnsIdentity.fullName || compactWallet(account.verifiedWallet);
  const collaborationPacket = useMemo(
    () => !migrationAvailable && selected
      ? buildMarketplaceCollaborationPacket({
          status: selected.status,
          projectTitle: project?.title,
          role: selected.role,
          brief: selected.brief,
          budget: selected.budget,
          timeline: selected.timeline,
          gnsName: gnsIdentity.status === "found" ? gnsIdentity.name : null,
        })
      : null,
    [gnsIdentity.name, gnsIdentity.status, migrationAvailable, project?.title, selected],
  );

  async function copyCollaborationPacket() {
    if (!collaborationPacket) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(collaborationPacket.text);
      setPacketCopyStatus("copied");
    } catch {
      try {
        window.prompt("Copy collaboration packet", collaborationPacket.text);
        setPacketCopyStatus("manual");
      } catch {
        setPacketCopyStatus("error");
      }
    }
    window.setTimeout(() => setPacketCopyStatus("idle"), 2200);
  }

  return (
    <div className="os-page os-runtime-page">
      <header className="os-runtime-heading">
        <span className="os-terminal-label">~/marketplace/briefs · {syncStatus}</span>
        <h1>Marketplace project briefs.</h1>
        <p>Prepare real collaboration requirements from Idea Lab now. Publishing, matching, escrow, and disputes stay gated until the production Marketplace API adapter is connected.</p>
      </header>

      <section className="os-runtime-grid">
        <aside className="os-runtime-panel os-runtime-note">
          <span className="os-terminal-label">PROJECT NEEDS · {state.marketplaceIntents.length}/12</span>
          {state.marketplaceIntents.length ? state.marketplaceIntents.map((intent) => {
            const intentProject = state.ideaProjects.find((item) => item.id === intent.projectId);
            return (
              <button
                key={intent.id}
                type="button"
                onClick={() => {
                  setSelectedId(intent.id);
                  setPacketCopyStatus("idle");
                }}
                aria-pressed={selected?.id === intent.id}
              >
                <strong>{roleLabels[intent.role]}</strong><br />
                <small>{intentProject?.title ?? "Project"} · {intent.status}</small>
              </button>
            );
          }) : <p>No collaboration briefs yet. Create one from an Idea Lab project.</p>}

          <div className="os-console-chrome"><span>brief.owner</span><span>{gnsIdentity.status.toUpperCase()}</span></div>
          <p><strong>{owner}</strong></p>
          <p>GwapScore: <strong>{gnsIdentity.score ?? "Unscored"}</strong></p>
          <Link href="/app/ideas/lab">Open Idea Lab</Link>
        </aside>

        <article className="os-runtime-panel">
          {selected ? (
            <>
              <div className="os-console-chrome"><span>marketplace.brief</span><span>{selected.status.toUpperCase()}</span></div>
              <p className="os-runtime-warning">This is a private GWAP OS project brief, not a live Marketplace listing.</p>
              <h2>{project?.title ?? "Project collaboration"}</h2>

              <label>
                Capability needed
                <select value={selected.role} onChange={(event) => updateMarketplaceIntent(selected.id, { role: event.target.value as MarketplaceRole })}>
                  {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>
                Scope / brief
                <textarea value={selected.brief} maxLength={1200} rows={8} placeholder="Describe the outcome, constraints, deliverables, and technical context." onChange={(event) => updateMarketplaceIntent(selected.id, { brief: event.target.value })} />
              </label>
              <label>
                Budget
                <input value={selected.budget} maxLength={160} placeholder="Example: $2,500 MVP budget or TBD" onChange={(event) => updateMarketplaceIntent(selected.id, { budget: event.target.value })} />
              </label>
              <label>
                Timeline
                <input value={selected.timeline} maxLength={160} placeholder="Example: 2–4 weeks" onChange={(event) => updateMarketplaceIntent(selected.id, { timeline: event.target.value })} />
              </label>
              <label>
                Readiness
                <select value={selected.status} onChange={(event) => updateMarketplaceIntent(selected.id, { status: event.target.value as "Draft" | "Ready" })}>
                  <option>Draft</option>
                  <option>Ready</option>
                </select>
              </label>
              <p><strong>Ready</strong> means the brief is prepared for the future Marketplace adapter; it does not publish anything yet.</p>

              <section className="os-runtime-note" aria-label="Collaboration packet">
                <span className="os-terminal-label">COLLABORATION PACKET</span>
                <p>
                  Explicitly copy the private brief details you choose to share. When a valid .gwap identity exists, the packet attaches only your public GWAP Trust Profile. Nothing is published or matched by this action.
                </p>
                {collaborationPacket ? (
                  <>
                    <button type="button" onClick={() => void copyCollaborationPacket()}>
                      {packetCopyStatus === "copied"
                        ? "Packet copied"
                        : packetCopyStatus === "manual"
                          ? "Manual copy opened"
                          : packetCopyStatus === "error"
                            ? "Copy failed"
                            : "Copy collaboration packet"}
                    </button>
                    {collaborationPacket.trustProfileUrl ? (
                      <p>
                        <a href={collaborationPacket.trustProfileUrl} target="_blank" rel="noreferrer">
                          Preview attached public Trust Profile ↗
                        </a>
                      </p>
                    ) : (
                      <p>
                        No public Trust Profile is attached. <Link href="/app/identity">Set up .gwap identity</Link> if you want public trust context included.
                      </p>
                    )}
                  </>
                ) : (
                  <p>
                    {migrationAvailable
                      ? "Resolve workspace authority in the banner above before copying private brief details."
                      : selected.status !== "Ready"
                        ? "Mark this brief Ready before creating a collaboration packet."
                        : "Add a non-empty scope before creating a collaboration packet."}
                  </p>
                )}
              </section>

              <PpvDeliverableAnchor
                sourceProduct="marketplace"
                sourceObjectId={selected.id}
                deliverableId="deliverable"
                payload={{ intentId: selected.id, milestoneIndex: null, state: "accepted" }}
                eligible={selected.status === "Ready"}
                ineligibleReason="Mark the brief Ready before anchoring its deliverable with PPV. Drafts are never anchored."
              />
              <div>
                <Link href="/app/ideas/lab">Back to Idea Lab</Link>{" · "}
                <Link href="/app/identity">Identity</Link>{" · "}
                <Link href="/app/score">GwapScore</Link>
              </div>
              <button type="button" onClick={() => { removeMarketplaceIntent(selected.id); setSelectedId(""); }}>Remove brief</button>
            </>
          ) : (
            <>
              <div className="os-console-chrome"><span>marketplace.brief</span><span>EMPTY</span></div>
              <h2>Build the requirement before the transaction.</h2>
              <p>Idea Lab can create Developer, Designer, Marketer, Researcher, or Operations briefs and seed them from the project context.</p>
              <Link href="/app/ideas/lab">Create a project brief</Link>
            </>
          )}

          <section className="os-runtime-note">
            <span className="os-terminal-label">MARKETPLACE RUNTIME</span>
            <div className="os-process-table" role="table" aria-label="Marketplace adapter status">
              <div role="row" className="os-process-row os-process-head"><span>PROCESS</span><span>STATE</span><span>CONTRACT</span></div>
              <div role="row" className="os-process-row"><span>Matching / Listings</span><strong className="state-pending">PENDING</strong><code>Marketplace API adapter</code></div>
              <div role="row" className="os-process-row"><span>Escrow</span><strong className="state-pending">PENDING</strong><code>INITIATED → FUNDED → DELIVERED → RELEASED</code></div>
              <div role="row" className="os-process-row"><span>Disputes</span><strong className="state-pending">PENDING</strong><code>SLA / ticket service</code></div>
            </div>
            <p>No fabricated providers, matches, transactions, or deal states are shown.</p>
          </section>
        </article>
      </section>
    </div>
  );
}
