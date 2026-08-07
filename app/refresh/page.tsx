import type { Metadata } from "next";
import { AuthSetupRequired } from "../components/auth-setup-required";
import { RefreshSessionClient } from "../components/refresh-session-client";
import { WalletAuthProvider } from "../components/wallet-auth-provider";
import { isWalletAuthConfigured } from "../lib/auth-config";
import { getSafeRedirectPath } from "../lib/safe-redirect";

export const metadata: Metadata = {
  title: "Refresh GWAP OS session",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RefreshPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
  if (!isWalletAuthConfigured()) return <AuthSetupRequired />;

  const query = await searchParams;
  const redirectPath = getSafeRedirectPath(
    Array.isArray(query.redirect_url) ? query.redirect_url[0] : query.redirect_url,
  );

  return (
    <WalletAuthProvider>
      <RefreshSessionClient redirectPath={redirectPath} />
    </WalletAuthProvider>
  );
}
