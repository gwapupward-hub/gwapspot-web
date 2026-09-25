import { getPpvWorkspaceReadiness } from "../../../lib/ppv/readiness.server";
import { PpvSectionPage } from "../section-page";
import { PpvAgreementActions } from "./agreement-actions";

export const dynamic = "force-dynamic";

export default async function PpvAgreementsPage() {
  const readiness = await getPpvWorkspaceReadiness();

  return (
    <PpvSectionPage
      layer="commerce"
      kicker="PPV COMMERCE"
      title="Agreements"
      description="Draft, review, revise and sign the exact version both wallets intend to execute."
      readiness={readiness}
      actions={[
        { key: "agreement.create", label: "Create agreement", detail: "Canonicalize content and terms before the wallet reviews the current version." },
        { key: "agreement.revise", label: "Revise agreement", detail: "A revision increments the version and clears every prior signature." },
        { key: "agreement.sign", label: "Sign current version", detail: "Sign only after the local content and terms match the finalized current version." },
        { key: "agreement.cancel", label: "Cancel pending agreement", detail: "Either party can terminally cancel an agreement while it is still pending." },
      ]}
    >
      <PpvAgreementActions
        mutationCapability={readiness.actions["agreement.create"]}
        layerCapability={readiness.layers.commerce}
      />
    </PpvSectionPage>
  );
}
