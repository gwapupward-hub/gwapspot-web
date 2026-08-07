import type { Metadata } from "next";
import { AuthSetupRequired } from "../../components/auth-setup-required";
import { WalletAuthProvider } from "../../components/wallet-auth-provider";
import { WalletSignIn } from "../../components/wallet-sign-in";
import { isWalletAuthConfigured } from "../../lib/auth-config";
import { getSafeRedirectPath } from "../../lib/safe-redirect";

export const metadata: Metadata = {
  title: "Sign in to GWAP OS",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SignInPage({
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
      <main className="auth-page">
        <div className="auth-page-brand">
          <span>GWAP OS / WALLET-FIRST ACCESS</span>
          <h1>One Solana identity. Every GWAP product.</h1>
          <p>
            Your wallet signs you in and out. If you do not have one yet, create
            an embedded Solana wallet with the email address you already use.
          </p>
        </div>
        <WalletSignIn redirectPath={redirectPath} />
      </main>
    </WalletAuthProvider>
  );
}
