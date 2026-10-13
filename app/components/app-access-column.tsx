"use client";

import { WalletAuthProvider } from "./wallet-auth-provider";
import { WalletSignIn } from "./wallet-sign-in";

// App-domain access surface.
//
// Email OTP is the default GWAP OS entry path. Existing Solana wallet users may
// still connect directly, while email users can enter without understanding or
// choosing a wallet. Privy may provision an embedded Solana wallet in the
// background so blockchain-backed features are available later when required.
export function AppAccessColumn({
  redirectPath,
  sessionIssue = false,
}: {
  redirectPath: string;
  sessionIssue?: boolean;
}) {
  return (
    <WalletAuthProvider>
      <WalletSignIn
        redirectPath={redirectPath}
        variant="app"
        sessionIssue={sessionIssue}
      />
    </WalletAuthProvider>
  );
}
