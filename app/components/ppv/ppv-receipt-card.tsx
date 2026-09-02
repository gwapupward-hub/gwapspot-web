import type { ReactNode } from "react";
import type { PpvReceiptV1 } from "../../lib/ppv-reputation/contracts";
import {
  EVENT_TYPE_LABELS,
  ROLE_LABELS,
  SEAL_STATE_LABELS,
  SOURCE_PRODUCT_LABELS,
  explorerAddressUrl,
  explorerTransactionUrl,
  formatAmount,
  formatCompletedAt,
  shortAddress,
} from "./ppv-labels";

/**
 * The receipt. The background image is decoration only; every value on the
 * receipt is real, accessible text so screen readers, copy/paste and search
 * all see the same facts a sighted reader does.
 */
export function PpvReceiptCard({ receipt, actions }: { receipt: PpvReceiptV1; actions?: ReactNode }) {
  const holderName = receipt.holderGnsRecord?.fullName ?? null;
  const counterparties = receipt.counterpartyWallets.map((wallet, index) => ({
    wallet,
    name: receipt.counterpartyGnsRecords[index]?.fullName ?? null,
  }));
  const amount = formatAmount(receipt.amount, receipt.mint);
  const sealLabel = SEAL_STATE_LABELS[receipt.sealState];

  return (
    <article className="ppv-receipt" aria-labelledby={`ppv-receipt-${receipt.receiptId}`}>
      <header className="ppv-receipt-head">
        <div>
          <p className="ppv-receipt-kicker">PPV receipt · schema v{receipt.schemaVersion}</p>
          <h1 className="ppv-receipt-title" id={`ppv-receipt-${receipt.receiptId}`}>
            {EVENT_TYPE_LABELS[receipt.eventType]}
          </h1>
          <p className="ppv-receipt-subtitle">
            {receipt.sourceProduct ? `${SOURCE_PRODUCT_LABELS[receipt.sourceProduct]} · ` : ""}
            {ROLE_LABELS[receipt.role]} receipt held by {holderName ?? shortAddress(receipt.holderWallet)}.
          </p>
        </div>
        <div className="ppv-seal" data-state={receipt.sealState}>
          <img src="/brand/ppv/ppv-verified-seal.png" alt="" aria-hidden="true" width={88} height={88} />
          <span className="ppv-seal-state">{sealLabel}</span>
          {receipt.disputeOpen ? <span className="ppv-flag">Dispute open</span> : null}
        </div>
      </header>

      <dl className="ppv-receipt-body">
        <div className="ppv-receipt-row"><dt>Receipt ID</dt><dd><code>{receipt.receiptId}</code></dd></div>
        <div className="ppv-receipt-row">
          <dt>Proof ID</dt>
          <dd>{receipt.ppvProofId ? <code>{receipt.ppvProofId}</code> : <span>No proof account (agreement-only record)</span>}{receipt.proofHash ? <small>Content hash {receipt.proofHash}</small> : null}</dd>
        </div>
        {receipt.agreementId ? <div className="ppv-receipt-row"><dt>Agreement</dt><dd><code>{receipt.agreementId}</code></dd></div> : null}
        <div className="ppv-receipt-row">
          <dt>Holder</dt>
          <dd><code>{receipt.holderWallet}</code>{holderName ? <small>GNS at event time: {holderName}</small> : <small>No .gwap name at event time</small>}</dd>
        </div>
        <div className="ppv-receipt-row"><dt>GNS name</dt><dd>{holderName ?? "—"}</dd></div>
        <div className="ppv-receipt-row"><dt>Role</dt><dd>{ROLE_LABELS[receipt.role]}</dd></div>
        <div className="ppv-receipt-row"><dt>Source product</dt><dd>{receipt.sourceProduct ? SOURCE_PRODUCT_LABELS[receipt.sourceProduct] : "PPV"}{receipt.sourceObjectId ? <small>{receipt.sourceObjectId}{receipt.deliverableId ? ` · ${receipt.deliverableId}` : ""}</small> : null}</dd></div>
        <div className="ppv-receipt-row">
          <dt>Counterparty</dt>
          <dd>
            {counterparties.length ? counterparties.map((party) => (
              <span key={party.wallet}>{party.name ?? shortAddress(party.wallet, 6)}<small>{party.wallet}</small></span>
            )) : "—"}
          </dd>
        </div>
        <div className="ppv-receipt-row"><dt>Amount</dt><dd>{amount ?? "No value transfer recorded"}</dd></div>
        <div className="ppv-receipt-row"><dt>Status</dt><dd><span className="ppv-state" data-state={receipt.sealState}>{sealLabel}</span><small>Outcome: {receipt.outcome}{receipt.disputeOpen ? " · dispute open" : ""}</small></dd></div>
        <div className="ppv-receipt-row">
          <dt>Transaction</dt>
          <dd><a href={explorerTransactionUrl(receipt.transactionSignature)} target="_blank" rel="noreferrer"><code>{shortAddress(receipt.transactionSignature, 10)}</code></a><small>Instruction {receipt.instructionIndex}{receipt.innerInstructionIndex !== null ? ` · inner ${receipt.innerInstructionIndex}` : ""} · program {shortAddress(receipt.programId, 6)}</small></dd>
        </div>
        <div className="ppv-receipt-row"><dt>Completed</dt><dd>{formatCompletedAt(receipt.completedAt)}<small>{receipt.completedAt}</small></dd></div>
        {receipt.credentialMint ? <div className="ppv-receipt-row"><dt>Credential</dt><dd><a href={explorerAddressUrl(receipt.credentialMint)} target="_blank" rel="noreferrer"><code>{receipt.credentialMint}</code></a></dd></div> : null}
      </dl>

      <footer className="ppv-receipt-foot">
        <p className="ppv-receipt-disclaimer">
          PPV Verified means this receipt corresponds to a verifiable PPV protocol record. It does not guarantee quality, copyright ownership, honesty, future behaviour, or general trustworthiness.
        </p>
        {actions}
      </footer>
    </article>
  );
}
