import { getPpvWorkspaceReadiness } from "../../../lib/ppv/readiness.server";
import { PpvSectionPage } from "../section-page";
import { PpvProofActions } from "./proof-actions";

export const dynamic = "force-dynamic";

export default async function PpvProofsPage() {
  const readiness = await getPpvWorkspaceReadiness();

  return (
    <PpvSectionPage
      layer="core"
      kicker="PPV CORE"
      title="Proofs"
      description="Create commitments without publishing private source bytes, verify exact evidence, and preserve revocation as history."
      readiness={readiness}
      actions={[
        { key: "proof.create", label: "Create proof", detail: "Hash evidence locally, then prepare a wallet-authorized Core commitment against the verified devnet deployment." },
        { key: "proof.revoke", label: "Revoke proof", detail: "Record an author revocation without deleting the original proof history." },
      ]}
    >
      <PpvProofActions
        createCapability={readiness.actions["proof.create"]}
        revokeCapability={readiness.actions["proof.revoke"]}
      />
    </PpvSectionPage>
  );
}
