"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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

type PacketActionStatus = "idle" | "copied" | "manual" | "shared" | "error";
type ProjectLoadState = "loading" | "ready" | "error";
type SharedProject = {
  id: string;
  title: string;
  status: string;
  problemDefinition: string;
  targetCustomer: string;
  technicalArchitecture: string;
  estimatedCost: string;
};
type WorkspacePayload = { projects?: { items?: SharedProject[] }; error?: string };

function compactWallet(wallet: string) {
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

function isShareCancellation(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name?: unknown }).name === "AbortError",
  );
}

export default function MarketplacePage() {
  const { getAccessToken } = usePrivy();
  const {
    account,
    createMarketplaceIntentFromProject,
    gnsIdentity,
    migrationAvailable,
    removeMarketplaceIntent,
    state,
    syncStatus,
    updateMarketplaceIntent,
  } = useGwapOs();
  const [selectedId, setSelectedId] = useState(state.marketplaceIntents[0]?.id ?? "");
  const [packetActionStatus, setPacketActionStatus] = useState<PacketActionStatus>("idle");
  const [workspaceProjects, setWorkspaceProjects] = useState<SharedProject[]>([]);
  const [projectLoadState, setProjectLoadState] = useState<ProjectLoadState>("loading");
  const [draftProjectId, setDraftProjectId] = useState("");
  const [draftRole, setDraftRole] = useState<MarketplaceRole | "">("");
  const selected = useMemo(
    () => state.marketplaceIntents.find((intent) => intent.id === selectedId) ?? state.marketplaceIntents[0] ?? null,
    [selectedId, state.marketplaceIntents],
  );
  const project = selected ? state.ideaProjects.find((item) => item.id === selected.projectId) ?? null : null;
  const selectedProjectTitle = selected?.projectTitle || project?.title || "Project collaboration";
  const owner = gnsIdentity.fullName || compactWallet(account.verifiedWallet);
  const collaborationPacket = useMemo(
    () => !migrationAvailable && selected
      ? buildMarketplaceCollaborationPacket({
          status: selected.status,
          projectTitle: selected.projectTitle || project?.title,
          role: selected.role,
          brief: selected.brief,
          budget: selected.budget,
          timeline: selected.timeline,
          gnsName: gnsIdentity.status === "found" ? gnsIdentity.name : null,
        })
      : null,
    [gnsIdentity.name, gnsIdentity.status, migrationAvailable, project?.title, selected],
  );

  const authenticatedFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const token = await getAccessToken();
    const headers = new Headers(init?.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers, credentials: "same-origin" });
  }, [getAccessToken]);

  useEffect(() => {
    let cancelled = false;
    setProjectLoadState("loading");
    setWorkspaceProjects([]);
    setDraftProjectId("");
    setDraftRole("");
    void (async () => {
      try {
        const response = await authenticatedFetch("/api/daily-ideas/workspace", { cache: "no-store" });
        const payload = (await response.json()) as WorkspacePayload;
        if (!response.ok) throw new Error(payload.error || "Daily Ideas projects could not load");
        if (cancelled) return;
        const projects = Array.isArray(payload.projects?.items)
          ? payload.projects.items.filter((item) => item && item.status !== "archived" && /^project_[a-f0-9]{20}$/.test(item.id) && item.title.trim().length > 0)
          : [];
        setWorkspaceProjects(projects);
        setDraftProjectId(projects[0]?.id ?? "");
        setProjectLoadState("ready");
      } catch {
        if (!cancelled) setProjectLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account.verifiedWallet, authenticatedFetch]);

  function resetPacketActionStatus() {
    window.setTimeout(() => setPacketActionStatus("idle"), 2200);
  }

  function preparePrivateDraft() {
    if (migrationAvailable || !draftProjectId || !draftRole) return;
    const source = workspaceProjects.find((item) => item.id === draftProjectId);
    if (!source) return;
    const intentId = createMarketplaceIntentFromProject({
      id: source.id,
      title: source.title,
      status: source.status,
      problemDefinition: source.problemDefinition || "",
      targetCustomer: source.targetCustomer || "",
      technicalArchitecture: source.technicalArchitecture || "",
      estimatedCost: source.estimatedCost || "",
    }, draftRole);
    if (!intentId) return;
    setSelectedId(intentId);
    setPacketActionStatus("idle");
  }

  async function copyCollaborationPacket() {
    if (!collaborationPacket) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(collaborationPacket.text);
      setPacketActionStatus("copied");
    } catch {
      try {
        window.prompt("Copy collaboration packet", collaborationPacket.text);
        setPacketActionStatus("manual");
      } catch {
        setPacketActionStatus("error");
      }
    }
    resetPacketActionStatus();
  }

  async function shareCollaborationPacket() {
    if (!collaborationPacket) return;
    if (typeof navigator.share !== "function") {
      await copyCollaborationPacket();
      return;
    }

    try {
      await navigator.share({
        title: "GWAP Collaboration Packet",
        text: collaborationPacket.text,
      });
      setPacketActionStatus("shared");
      resetPacketActionStatus();
    } catch (error) {
      if (isShareCancellation(error)) {
        setPacketActionStatus("idle");
        return;
      }
      await copyCollaborationPacket();
    }
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
                  setPacketActionStatus("idle");
                }}
                aria-pressed={selected?.id === intent.id}
              >
                <strong>{roleLabels[intent.role]}</strong><br />
                <small>{intent.projectTitle || intentProject?.title || "Project"} · {intent.status}</small>
              </button>
            );
          }) : <p>No collaboration briefs yet. Prepare one from a canonical Daily Ideas project below.</p>}

          <div className="os-console-chrome"><span>new.private.brief</span><span>DRAFT ONLY</span></div>
          {migrationAvailable ? (
            <p>Resolve workspace authority in the banner above before creating a new private Marketplace draft.</p>
          ) : projectLoadState === "loading" ? (
            <p>Loading canonical Daily Ideas projects…</p>
          ) : projectLoadState === "error" ? (
            <p>Daily Ideas projects are temporarily unavailable. Existing Marketplace briefs remain available.</p>
          ) : workspaceProjects.length ? (
            <>
              <label>
                Project
                <select value={draftProjectId} onChange={(event) => setDraftProjectId(event.target.value)}>
                  {workspaceProjects.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
              </label>
              <label>
                Capability needed
                <select value={draftRole} onChange={(event) => setDraftRole(event.target.value as MarketplaceRole | "")}>
                  <option value="">Choose capability</option>
                  {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <button type="button" disabled={!draftProjectId || !draftRole} onClick={preparePrivateDraft}>Prepare private Draft</button>
              <small>Uses the canonical Daily Ideas project as context. This action never publishes or matches anything.</small>
            </>
          ) : (
            <p>No active Daily Ideas project is available yet. <Link href="/app/ideas/lab/start">Start a project</Link>.</p>
          )}

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
              <h2>{selectedProjectTitle}</h2>

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
                  Preview the exact bounded packet before you copy or share private brief details. When a valid .gwap identity exists, the packet attaches only your public GWAP Trust Profile. Nothing is published or matched by these actions.
                </p>
                {collaborationPacket ? (
                  <>
                    <details>
                      <summary>Preview exact packet text</summary>
                      <p>
                        This is the exact text Copy and Share use. Opening this preview does not publish or transmit anything.
                      </p>
                      <textarea
                        aria-label="Collaboration packet preview"
                        value={collaborationPacket.text}
                        readOnly
                        rows={12}
                      />
                    </details>
                    <div>
                      <button type="button" onClick={() => void copyCollaborationPacket()}>
                        {packetActionStatus === "copied"
                          ? "Packet copied"
                          : packetActionStatus === "manual"
                            ? "Manual copy opened"
                            : packetActionStatus === "error"
                              ? "Copy failed"
                              : "Copy collaboration packet"}
                      </button>{" "}
                      <button type="button" onClick={() => void shareCollaborationPacket()}>
                        {packetActionStatus === "shared"
                          ? "Packet shared"
                          : "Share collaboration packet"}
                      </button>
                    </div>
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
                      ? "Resolve workspace authority in the banner above before previewing, copying, or sharing private brief details."
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
              <p>Choose a canonical Daily Ideas project and capability in the New Private Brief panel. GWAP will seed a Draft from the project context for you to review.</p>
              <Link href="/app/ideas/lab">Open Idea Lab</Link>
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
