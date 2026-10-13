import type { Metadata } from "next";
import { AuthSetupRequired } from "../../components/auth-setup-required";
import { WalletAuthProvider } from "../../components/wallet-auth-provider";
import { WalletSignIn } from "../../components/wallet-sign-in";
import { isWalletAuthConfigured } from "../../lib/auth-config";
import { getSafeRedirectPath } from "../../lib/safe-redirect";

export const metadata: Metadata = {
  title: "Sign in to GWAP OS",
  description: "Simple account access to your GWAP workspace. Start with email and connect a wallet only when you need blockchain features.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    redirect_url?: string | string[];
    session_issue?: string | string[];
  }>;
}) {
  if (!isWalletAuthConfigured()) return <AuthSetupRequired />;

  const query = await searchParams;
  const redirectPath = getSafeRedirectPath(
    Array.isArray(query.redirect_url) ? query.redirect_url[0] : query.redirect_url,
  );
  const sessionIssue =
    (Array.isArray(query.session_issue) ? query.session_issue[0] : query.session_issue) ===
    "1";

  return (
    <WalletAuthProvider>
      <main className="auth-page">
        <div className="auth-page-brand">
          <span>GWAP OS / SECURE ACCOUNT ACCESS</span>
          <h1>One account. Your identity, reputation, work, and proof.</h1>
          <p>
            Start with the email you already use. GWAP keeps blockchain infrastructure
            in the background until a feature actually needs it, and you can connect an
            existing Solana wallet at any time.
          </p>
        </div>
        <WalletSignIn redirectPath={redirectPath} sessionIssue={sessionIssue} />
      </main>
    </WalletAuthProvider>
  );
}
