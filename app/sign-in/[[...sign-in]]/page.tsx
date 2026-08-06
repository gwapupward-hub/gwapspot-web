import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import { AuthSetupRequired } from "../../components/auth-setup-required";
import { isClerkConfigured } from "../../lib/auth-config";

export const metadata: Metadata = {
  title: "Sign in to GWAP OS",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function SignInPage() {
  if (!isClerkConfigured()) return <AuthSetupRequired />;

  return (
    <main className="auth-page">
      <div className="auth-page-brand">
        <span>GWAP OS</span>
        <h1>One secure identity. Every GWAP product.</h1>
        <p>Continue with email, Google, GitHub, or a verified Solana wallet.</p>
      </div>
      <SignIn />
    </main>
  );
}
