import { IdentityWalletView } from "../components/identity-wallet-view";
import { normalizePublicLookup } from "../../lib/public-lookup";

export default async function IdentityPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string | string[] }>;
}) {
  const query = await searchParams;
  const rawName = Array.isArray(query.name) ? query.name[0] : query.name;
  let suggestedName = "";

  if (rawName) {
    try {
      suggestedName = normalizePublicLookup("name", rawName).value;
    } catch {
      // Untrusted or stale public lookup values never pre-authorize a claim.
    }
  }

  return <IdentityWalletView suggestedName={suggestedName} />;
}
