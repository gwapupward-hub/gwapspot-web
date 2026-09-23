import { PpvSectionPage } from "../section-page";

export const dynamic = "force-dynamic";

export default function PpvProofsPage() {
  return (
    <PpvSectionPage
      layer="core"
      kicker="PPV CORE"
      title="Proofs"
      description="Create commitments without publishing private source bytes, verify exact evidence, and preserve revocation as history."
      actions={[
        { key: "proof.create", label: "Create proof", detail: "Prepare a wallet-authorized Core commitment only after exact deployment compatibility passes." },
        { key: "proof.revoke", label: "Revoke proof", detail: "Record an author revocation without deleting the original proof history." },
      ]}
    />
  );
}
