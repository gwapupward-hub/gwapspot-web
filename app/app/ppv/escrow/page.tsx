import { PpvSectionPage } from "../section-page";

export const dynamic = "force-dynamic";

export default function PpvEscrowPage() {
  return (
    <PpvSectionPage
      layer="escrow"
      kicker="PPV ESCROW"
      title="Escrow"
      description="Test-asset execution for funding, evidence, completion, settlement, milestones and disputes—only against an approved compatible binary."
      actions={[
        { key: "escrow.open", label: "Open escrow", detail: "Bind exact roles, mint, token program, amount and supported state-machine parameters." },
        { key: "escrow.fund", label: "Fund", detail: "Classic SPL test assets only. Real-value custody remains disabled." },
        { key: "escrow.settle", label: "Settle", detail: "Cited settlement must include both the Escrow Proof and its distinct live Core ProofRecord—or neither." },
      ]}
    />
  );
}
