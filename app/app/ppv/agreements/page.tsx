import { PpvSectionPage } from "../section-page";

export const dynamic = "force-dynamic";

export default function PpvAgreementsPage() {
  return (
    <PpvSectionPage
      layer="commerce"
      kicker="PPV COMMERCE"
      title="Agreements"
      description="Draft, review, revise and sign the exact version both wallets intend to execute."
      actions={[
        { key: "agreement.create", label: "Create agreement", detail: "Canonicalize content and terms before the wallet reviews the current version." },
        { key: "agreement.sign", label: "Sign current version", detail: "A revision invalidates stale signatures; the exact version must be reviewed again." },
      ]}
    />
  );
}
