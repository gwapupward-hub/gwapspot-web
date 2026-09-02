"use client";

import { useEffect, useState } from "react";
import type { VerifiedActivityItem } from "../../lib/ppv-reputation-projection";
import { EVENT_TYPE_LABELS, ROLE_LABELS, SEAL_STATE_LABELS, SOURCE_PRODUCT_LABELS, formatAmount, shortAddress } from "./ppv-labels";

type ActivityState =
  | { status: "loading" }
  | { status: "ready"; items: VerifiedActivityItem[]; wallet: string | null }
  | { status: "unavailable"; message: string };

/**
 * GNS Verified Activity. Facts only: seal state, product, activity, role,
 * counterparty, amount, date, receipt link. GwapScore is computed elsewhere
 * and is deliberately not part of this component.
 */
export function PpvVerifiedActivity({
  wallet,
  domain,
  title = "Verified Activity",
  receiptHref = (id: string) => `/receipt/${id}`,
}: {
  wallet?: string;
  domain?: string;
  title?: string;
  receiptHref?: (receiptId: string) => string;
}) {
  const query = wallet ? `wallet=${encodeURIComponent(wallet)}` : domain ? `domain=${encodeURIComponent(domain)}` : null;
  const [state, setState] = useState<ActivityState>(() =>
    query ? { status: "loading" } : { status: "unavailable", message: "Nothing to resolve." },
  );

  useEffect(() => {
    if (!query) return () => undefined;
    let cancelled = false;
    fetch(`/api/ppv/activity?${query}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as { items?: VerifiedActivityItem[]; wallet?: string | null; error?: string };
        if (cancelled) return;
        if (!response.ok) {
          setState({ status: "unavailable", message: payload.error || "Verified activity is unavailable." });
          return;
        }
        setState({ status: "ready", items: payload.items ?? [], wallet: payload.wallet ?? null });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "unavailable", message: "Verified activity is unavailable." });
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <section className="ppv-activity" aria-label={title}>
      <header className="ppv-activity-head">
        <div>
          <span className="os-terminal-label">PPV · GNS VERIFIED ACTIVITY</span>
          <h2>{title}</h2>
          <p>Factual PPV protocol records attributed to the wallet that held them. Seal states are derived from the PPV state machine, never entered by hand.</p>
        </div>
      </header>
      {state.status === "loading" ? <p className="ppv-activity-empty">Loading verified activity…</p> : null}
      {state.status === "unavailable" ? <p className="ppv-activity-empty">{state.message}</p> : null}
      {state.status === "ready" && !state.items.length ? <p className="ppv-activity-empty">No PPV activity recorded yet.</p> : null}
      {state.status === "ready" && state.items.length ? (
        <div className="ppv-scroll">
          <table className="ppv-activity-table">
            <thead>
              <tr><th>Seal</th><th>Source</th><th>Activity</th><th>Role</th><th>Counterparty</th><th>Amount</th><th>Date</th><th aria-label="Receipt" /></tr>
            </thead>
            <tbody>
              {state.items.map((item) => (
                <tr key={item.receiptId}>
                  <td><span className="ppv-state" data-state={item.sealState}>{SEAL_STATE_LABELS[item.sealState]}</span>{item.disputeOpen ? <small>Dispute open</small> : null}</td>
                  <td>{item.sourceProduct ? SOURCE_PRODUCT_LABELS[item.sourceProduct] : "PPV"}</td>
                  <td>{EVENT_TYPE_LABELS[item.eventType]}<small>{item.outcome}</small></td>
                  <td>{ROLE_LABELS[item.role]}</td>
                  <td>
                    {item.counterpartyWallets.length ? item.counterpartyWallets.map((counterparty, index) => (
                      <span key={counterparty}>{item.counterpartyGnsRecords[index]?.fullName ?? shortAddress(counterparty)}<small>{shortAddress(counterparty, 6)}</small></span>
                    )) : "—"}
                  </td>
                  <td>{formatAmount(item.amount, item.mint) ?? "—"}</td>
                  <td>{new Date(item.completedAt).toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" })}</td>
                  <td><a href={receiptHref(item.receiptId)}>View Receipt →</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
