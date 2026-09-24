"use client";

import { WalletAuthProvider } from "./wallet-auth-provider";
import { WalletSignIn } from "./wallet-sign-in";

// App-domain access surface.
//
// GWAP OS supports two first-class authentication paths:
//   1. an existing Solana wallet; or
//   2. email OTP, which provisions/reuses a Privy embedded Solana wallet.
//
// Do not gate this surface on injected-wallet detection. Email users must be
// able to enter from an ordinary browser, and desktop users with wallet
// extensions should let Privy discover those wallets directly.
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
