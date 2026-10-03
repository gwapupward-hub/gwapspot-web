import { getPpvWorkspaceReadiness } from "../../../../lib/ppv/readiness.server";
import { PpvSectionPage } from "../../section-page";
import { PpvAgreementActions } from "../agreement-actions";

export const dynamic = "force-dynamic";

export default async function PpvAgreementsAdvancedPage() {
  const readiness = await getPpvWorkspaceReadiness();

  return (
    <PpvSectionPage
      layer="commerce"
      kicker="PPV COMMERCE · ADVANCED"
      title="Protocol workbench"
      description="Developer-only structured document, manual lookup, and executed-agreement Core binding tools. Normal agreement creation belongs in the consumer Agreement Workspace."
      readiness={readiness}
      actions={[
        { key: "agreement.create", label: "Create", detail: "Prepare a canonical Commerce create transaction from structured documents." },
        { key: "agreement.revise", label: "Revise", detail: "Publish a new canonical agreement version." },
        { key: "agreement.sign", label: "Sign", detail: "Sign the exact finalized current version after local hash review." },
        { key: "agreement.cancel", label: "Cancel", detail: "Cancel a pending agreement." },
      ]}
    >
      <PpvAgreementActions
        environment={readiness.environment}
        mutationCapability={readiness.actions["agreement.create"]}
        coreMutationCapability={readiness.actions["proof.create"]}
        layerCapability={readiness.layers.commerce}
      />
    </PpvSectionPage>
  );
}
