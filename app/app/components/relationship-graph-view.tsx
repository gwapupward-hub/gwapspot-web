"use client";

import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  deriveRelationshipGraph,
  type RelationshipEdge,
  type RelationshipNode,
} from "../lib/relationship-graph";
import { useGwapOs } from "./os-provider";

type AccountPayload = {
  id: string;
  linkedAccounts?: {
    privy?: boolean;
    telegram?: { userId?: string } | null;
  };
  wallets?: Array<{
    address?: string;
    kind?: "embedded" | "external";
    primary?: boolean;
  }>;
  primaryWallet?: string | null;
  primaryGnsIdentity?: string | null;
};

function nodeIcon(node: RelationshipNode) {
  if (node.type === "account") return "◎";
  if (node.type === "wallet") return "◈";
  if (node.type === "gns") return "◇";
  if (node.type === "telegram") return "✦";
  if (node.type === "social") return "@";
  return "↔";
}

function provenanceLabel(edge: RelationshipEdge) {
  if (edge.provenance === "authenticated") return "AUTHENTICATED";
  if (edge.provenance === "account-link") return "ACCOUNT LINK";
  if (edge.provenance === "resolved") return "RESOLVED";
  return "PLANNED";
}

export function RelationshipGraphView() {
  const { getAccessToken } = usePrivy();
  const { account, gnsIdentity } = useGwapOs();
  const [accountGraph, setAccountGraph] = useState<AccountPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4500);

    void getAccessToken()
      .then((token) =>
        fetch("/api/account", {
          cache: "no-store",
          credentials: "same-origin",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          signal: controller.signal,
        }),
      )
      .then(async (response) => {
        if (!response.ok) throw new Error("Relationship data unavailable");
        return (await response.json()) as AccountPayload;
      })
      .then((payload) => {
        if (!active) return;
        setAccountGraph(payload);
        setUnavailable(false);
      })
      .catch(() => {
        if (active) setUnavailable(true);
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [getAccessToken]);

  const graph = useMemo(() => {
    if (!accountGraph) return null;
    return deriveRelationshipGraph(accountGraph, gnsIdentity);
  }, [accountGraph, gnsIdentity]);

  return (
    <div className="os-page os-home-v2">
      <section className="os-v2-hero">
        <div>
          <span className="os-terminal-label">GWAP://TRUST/RELATIONSHIPS</span>
          <h1>See exactly what is <span>connected.</span></h1>
          <p>
            Relationship Graph shows how your GWAP account, wallets, .gwap identity, and linked services relate to each other—and the provenance GWAP uses before calling any connection verified.
          </p>
        </div>
        <div className="os-runtime-badge state-found">
          <i />
          <span>
            <small>VERIFIED EDGES</small>
            <strong>{graph?.verifiedEdges ?? "—"}</strong>
          </span>
        </div>
      </section>

      {loading ? (
        <section className="os-runtime-panel os-runtime-note" role="status">
          <span className="os-terminal-label">RELATIONSHIP GRAPH</span>
          <h2>Loading canonical account relationships…</h2>
          <p>GWAP is reading your authenticated account record and live identity resolution.</p>
        </section>
      ) : null}

      {unavailable ? (
        <section className="os-runtime-panel os-runtime-note" role="alert">
          <span className="os-terminal-label">RELATIONSHIP GRAPH</span>
          <h2>Relationship data is temporarily unavailable.</h2>
          <p>This is an infrastructure state, not a negative trust signal. Your reputation and Trust Coverage are not reduced.</p>
          <Link href="/app/trust">Return to Trust Graph →</Link>
        </section>
      ) : null}

      {graph ? (
        <>
          <section className="os-v2-layout">
            <article className="os-identity-console">
              <div className="os-console-chrome"><span>CANONICAL ACCOUNT MAP</span><span>PROVENANCE AWARE</span></div>
              <div className="os-identity-body">
                <div className="os-v2-avatar" aria-hidden="true">◎</div>
                <div className="os-identity-copy">
                  <span className="os-terminal-label">ROOT ENTITY</span>
                  <h2>{gnsIdentity.fullName || account.displayName || "GWAP Account"}</h2>
                  <p>
                    The GWAP account is the root identity record. Wallets, names, Telegram, and future verified services attach to this record only through explicit provenance.
                  </p>
                  <div className="os-identity-meta">
                    <span><small>NODES</small><strong>{graph.nodes.length}</strong></span>
                    <span><small>VERIFIED EDGES</small><strong>{graph.verifiedEdges}</strong></span>
                    <span><small>PLANNED EDGES</small><strong>{graph.plannedEdges}</strong></span>
                  </div>
                </div>
              </div>
            </article>

            <aside className="os-runtime-panel os-runtime-note">
              <span className="os-terminal-label">PROVENANCE RULE</span>
              <h2>No mystery connections.</h2>
              <p>
                Authenticated means the active session proves wallet control. Account Link means GWAP stored an explicit canonical relationship. Resolved means a live protocol such as GNS establishes the edge. Planned relationships are never treated as verified.
              </p>
            </aside>
          </section>

          <section className="os-app-launcher">
            <div className="os-section-heading-v2">
              <span className="os-terminal-label">ENTITIES</span>
              <p>Everything currently represented in your GWAP relationship graph.</p>
            </div>
            <div className="os-process-grid">
              {graph.nodes.map((node) => (
                <article key={node.id} className="os-process-tile">
                  <span className="os-process-icon" aria-hidden="true">{nodeIcon(node)}</span>
                  <span>
                    <strong>{node.label}</strong>
                    <small>{node.state.toUpperCase()} · {node.type.toUpperCase()}</small>
                    <em>{node.detail}</em>
                  </span>
                </article>
              ))}
            </div>
          </section>

          <section className="os-app-launcher">
            <div className="os-section-heading-v2">
              <span className="os-terminal-label">RELATIONSHIPS + PROVENANCE</span>
              <p>Why GWAP believes each connection exists.</p>
            </div>
            <div className="os-process-grid">
              {graph.edges.map((edge) => (
                <article key={edge.id} className="os-process-tile">
                  <span className="os-process-icon" aria-hidden="true">{edge.verified ? "✓" : "◇"}</span>
                  <span>
                    <strong>{edge.label}</strong>
                    <small>{provenanceLabel(edge)} · {edge.verified ? "VERIFIED" : "NOT ACTIVE"}</small>
                    <em>{edge.detail}</em>
                  </span>
                </article>
              ))}
            </div>
          </section>

          <section className="os-v2-layout">
            <aside className="os-runtime-panel os-runtime-note">
              <span className="os-terminal-label">NEXT: PROOF OF CONTROL</span>
              <h2>Social accounts will join through proof, not usernames.</h2>
              <p>
                When GwapScore social verification ships, X and other supported accounts will enter this graph only after the user completes the Proof-of-Control challenge. Until then they remain planned nodes.
              </p>
              <Link href="/app/score">Open GwapScore →</Link>
            </aside>
            <aside className="os-runtime-panel os-runtime-note">
              <span className="os-terminal-label">NEXT: COUNTERPARTIES</span>
              <h2>Economic relationships need their own provenance.</h2>
              <p>
                Marketplace work, completed transactions, team relationships, endorsements, and future OCCO signals will become relationship edges only when GWAP can identify the source and lifecycle of that relationship.
              </p>
              <Link href="/app/marketplace">Open Marketplace →</Link>
            </aside>
          </section>
        </>
      ) : null}
    </div>
  );
}
