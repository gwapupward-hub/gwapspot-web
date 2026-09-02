"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { GwapDeliverableReferenceV1, SourceProduct } from "../../lib/ppv-reputation/contracts";
import { SOURCE_PRODUCT_LABELS, shortAddress } from "./ppv-labels";

type AnchorStatus = { tone: "info" | "ok" | "error"; message: string };

/**
 * Anchors a product deliverable to a PPV proof. The form only collects the
 * proof account, its committed hash and an optional counterparty; the server
 * re-reads the proof from chain and refuses anything the caller does not own.
 * `eligible` gates the form to finalized work as decided by the product.
 */
export function PpvDeliverableAnchor({
  sourceProduct,
  sourceObjectId,
  deliverableId,
  payload,
  eligible,
  ineligibleReason,
}: {
  sourceProduct: SourceProduct;
  sourceObjectId: string;
  deliverableId: string;
  /** Product-specific body fields (intentId, projectId, status, kind…). */
  payload: Record<string, unknown>;
  eligible: boolean;
  ineligibleReason: string;
}) {
  const [existing, setExisting] = useState<GwapDeliverableReferenceV1 | null>(null);
  const [status, setStatus] = useState<AnchorStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ sourceProduct, sourceObjectId, deliverableId });
    fetch(`/api/ppv/deliverables?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => (response.ok ? ((await response.json()) as { reference: GwapDeliverableReferenceV1 | null }).reference : null))
      .then((reference) => {
        if (!cancelled) setExisting(reference);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sourceProduct, sourceObjectId, deliverableId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setStatus({ tone: "info", message: "Verifying the proof on chain…" });
    try {
      const response = await fetch("/api/ppv/deliverables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          sourceProduct,
          proof: {
            ppvProofId: String(form.get("ppvProofId") ?? "").trim(),
            proofHash: String(form.get("proofHash") ?? "").trim().toLowerCase(),
            counterpartyWallet: String(form.get("counterpartyWallet") ?? "").trim() || null,
          },
          proofTransactionSignature: String(form.get("proofTransactionSignature") ?? "").trim() || null,
        }),
      });
      const result = (await response.json()) as { reference?: GwapDeliverableReferenceV1; error?: string; receiptIds?: string[] };
      if (!response.ok || !result.reference) {
        setStatus({ tone: "error", message: result.error || "The deliverable could not be anchored." });
        return;
      }
      setExisting(result.reference);
      setStatus({ tone: "ok", message: `Anchored to PPV proof ${shortAddress(result.reference.ppvProofId, 6)}. ${result.receiptIds?.length ?? 0} receipt(s) issued.` });
    } catch {
      setStatus({ tone: "error", message: "The PPV service could not be reached." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="os-runtime-note ppv-anchor" aria-label="PPV deliverable anchor">
      <span className="os-terminal-label">PPV PROOF REFERENCE · {SOURCE_PRODUCT_LABELS[sourceProduct].toUpperCase()}</span>
      {existing ? (
        <p className="ppv-anchor-status" data-tone="ok">
          Anchored to PPV proof <code>{existing.ppvProofId}</code> ({existing.deliverableKind}) on {new Date(existing.createdAt).toLocaleDateString(undefined, { dateStyle: "medium", timeZone: "UTC" })}.
          {existing.counterpartyWallet ? ` Submitted to ${shortAddress(existing.counterpartyWallet, 6)}.` : ""}
        </p>
      ) : !eligible ? (
        <p className="ppv-anchor-status">{ineligibleReason}</p>
      ) : (
        <form onSubmit={submit} className="ppv-anchor">
          <p className="ppv-anchor-status">Reference the PPV proof that commits to this deliverable. The proof must already exist on chain under your wallet.</p>
          <label>PPV proof account<input name="ppvProofId" required minLength={32} maxLength={44} placeholder="Proof PDA (base58)" /></label>
          <label>Content hash (SHA-256 hex)<input name="proofHash" required pattern="[0-9a-fA-F]{64}" placeholder="64 hex characters" /></label>
          <label>Counterparty wallet (optional)<input name="counterpartyWallet" maxLength={44} placeholder="Buyer or collaborator wallet" /></label>
          <label>Proof creation transaction (optional)<input name="proofTransactionSignature" maxLength={90} placeholder="Speeds up indexing if the proof is new" /></label>
          <button type="submit" className="ppv-btn ppv-btn-primary" disabled={busy}>{busy ? "Anchoring…" : "Anchor with PPV"}</button>
        </form>
      )}
      {status ? <p className="ppv-anchor-status" data-tone={status.tone} role="status">{status.message}</p> : null}
    </section>
  );
}
