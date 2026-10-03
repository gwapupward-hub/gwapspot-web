import { getPpvWorkspaceReadiness } from "../../../lib/ppv/readiness.server";
import { PpvSectionPage } from "../section-page";
import { PpvAgreementSessionGate } from "./agreement-session-gate";
import { PpvAgreementWorkspace } from "./agreement-workspace";

export const dynamic = "force-dynamic";

export default async function PpvAgreementsPage() {
  const readiness = await getPpvWorkspaceReadiness();

  return (
    <PpvSectionPage
      layer="commerce"
      kicker="PPV COMMERCE"
      title="Agreements"
      description="Create, review, revise and approve the exact agreement version both parties intend to execute—without writing protocol JSON."
      readiness={readiness}
      actions={[
        { key: "agreement.create", label: "Create agreement", detail: "Write normal contract terms while GWAP generates the canonical structured documents and fingerprints." },
        { key: "agreement.revise", label: "Revise agreement", detail: "A published revision increments the version and clears prior signatures so everyone reviews the same terms again." },
        { key: "agreement.sign", label: "Approve & sign", detail: "Approval unlocks only after GWAP verifies the displayed agreement matches the finalized on-chain fingerprints." },
        { key: "agreement.cancel", label: "Decline or cancel", detail: "Either party can terminally cancel a pending agreement before execution." },
      ]}
    >
      <PpvAgreementSessionGate>
        <PpvAgreementWorkspace
          environment={readiness.environment}
          mutationCapability={readiness.actions["agreement.create"]}
          layerCapability={readiness.layers.commerce}
        />
      </PpvAgreementSessionGate>
    </PpvSectionPage>
  );
}
