"use client";

import { useWalletHostDetection } from "../lib/use-wallet-host-detection";
import { WalletHostRequired } from "./wallet-host-required";
import { WalletSignIn } from "./wallet-sign-in";

// The app-domain gate (Phase 1/2): keeps the full wallet sign-in flow -
// including the Privy wallet selector - unavailable to ordinary browsers.
// Detection is capability-based (wallet-host-detection.ts), not
// user-agent-based, and only ever observes registered wallets; it never
// itself calls connect, so it cannot produce a duplicate connection
// attempt.
export function WalletHostGate({
  redirectPath,
  sessionIssue,
}: {
  redirectPath: string;
  sessionIssue: boolean;
}) {
  const detection = useWalletHostDetection();

  if (detection.status === "detecting") {
    return (
      <section className="wallet-auth-card" aria-busy="true">
        <span className="wallet-auth-eyebrow">GWAP OS / SECURE ACCESS</span>
        <h2>Checking your wallet browser…</h2>
      </section>
    );
  }

  if (detection.status === "missing" || detection.status === "unsupported") {
    return <WalletHostRequired reason={detection.status} />;
  }

  return (
    <WalletSignIn
      redirectPath={redirectPath}
      variant="app"
      sessionIssue={sessionIssue}
    />
  );
}
