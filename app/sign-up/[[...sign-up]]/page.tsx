import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import { AuthSetupRequired } from "../../components/auth-setup-required";
import { isClerkConfigured } from "../../lib/auth-config";

export const metadata: Metadata = {
  title: "Create a GWAP OS account",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function SignUpPage() {
  if (!isClerkConfigured()) return <AuthSetupRequired />;

  return (
    <main className="auth-page">
      <div className="auth-page-brand">
        <span>GWAP OS</span>
        <h1>Create your ecosystem identity.</h1>
        <p>Your profile, favorites, activity, and preferences follow your account.</p>
      </div>
      <SignUp />
    </main>
  );
}
