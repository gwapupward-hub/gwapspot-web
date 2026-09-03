"use client";

import { useState } from "react";
import type { PpvReceiptV1 } from "../../lib/ppv-reputation/contracts";
import { explorerAddressUrl, explorerTransactionUrl } from "./ppv-labels";

type CredentialResponse =
  | { eligible: true; metadata: Record<string, unknown>; authorization: { expiresAt: string }; verificationUri: string }
  | { eligible: false; reasons: string[] }
  | { error: string };

/**
 * Verify Proof, Share, and (only when the server says the receipt is
 * eligible) Mint Credential. Eligibility shown here is a hint; the mint
 * endpoint re-evaluates everything server-side from chain state.
 */
export function PpvReceiptActions({ receipt, canMint }: { receipt: PpvReceiptV1; canMint: boolean }) {
  const [shared, setShared] = useState<"idle" | "copied" | "shared">("idle");
  const [credential, setCredential] = useState<CredentialResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const publicUrl = typeof window === "undefined" ? `/receipt/${receipt.receiptId}` : `${window.location.origin}/receipt/${receipt.receiptId}`;

  async function share() {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title: "PPV receipt", url: publicUrl });
        setShared("shared");
        return;
      }
      await navigator.clipboard.writeText(publicUrl);
      setShared("copied");
    } catch {
      setShared("idle");
    }
    window.setTimeout(() => setShared("idle"), 1600);
  }

  async function mint() {
    setBusy(true);
    setCredential(null);
    try {
      const response = await fetch(`/api/ppv/receipts/${encodeURIComponent(receipt.receiptId)}/credential`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      setCredential((await response.json()) as CredentialResponse);
    } catch {
      setCredential({ error: "The credential service could not be reached." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="ppv-actions">
        <a className="ppv-btn" href={explorerTransactionUrl(receipt.transactionSignature)} target="_blank" rel="noreferrer">Verify Proof ↗</a>
        {receipt.ppvProofId ? <a className="ppv-btn" href={explorerAddressUrl(receipt.ppvProofId)} target="_blank" rel="noreferrer">Proof account ↗</a> : null}
        <button type="button" className="ppv-btn" onClick={share}>{shared === "copied" ? "Link copied" : shared === "shared" ? "Shared" : "Share"}</button>
        {canMint && receipt.mintEligible && !receipt.credentialMint ? (
          <button type="button" className="ppv-btn ppv-btn-primary" onClick={mint} disabled={busy}>{busy ? "Checking…" : "Mint Credential"}</button>
        ) : null}
      </div>
      {credential ? (
        <div className="ppv-notice" role="status">
          {"error" in credential ? credential.error : credential.eligible ? (
            <>
              Eligibility confirmed from chain state. Public metadata and a mint authorization valid until {credential.authorization.expiresAt} were prepared; no NFT has been minted. The minting service consumes this authorization when it is connected.
              <code>{JSON.stringify(credential.metadata, null, 2)}</code>
            </>
          ) : (
            <>Not eligible yet: {credential.reasons.join(", ").replace(/_/g, " ")}.</>
          )}
        </div>
      ) : null}
    </div>
  );
}
