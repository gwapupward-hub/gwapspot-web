"use client";

import { osAuthStateLabel } from "../lib/os-auth-state";
import { useWalletHost } from "./use-wallet-host";
import { WalletAuthProvider } from "./wallet-auth-provider";
import { WalletHostGateway } from "./wallet-host-gateway";
import { WalletSignIn } from "./wallet-sign-in";

// App-domain access surface. Capability-based wallet-host detection decides what
// an ordinary browser sees: supported wallet hosts get the wallet sign-in flow,
// everything else gets the wallet-required gateway. The full GwapOS client is
// never rendered outside a supported wallet host.
//
// The Privy wallet provider is mounted ONLY for supported wallet hosts, so the
// gateway and detection surfaces render independently of the wallet SDK and can
// never be blocked by provider initialization.
export function AppAccessColumn({
  redirectPath,
  sessionIssue = false,
}: {
  redirectPath: string;
  // Set when the proxy detected a redirect loop for this session (see
  // proxy-routing.ts). Passed through to WalletSignIn, which uses it to
  // require an explicit reconnect instead of silently retrying.
  sessionIssue?: boolean;
}) {
  const host = useWalletHost();

  if (host.status === "detecting") {
    return (
      <section className="wallet-auth-card" aria-busy="true">
        <span className="wallet-auth-eyebrow">GWAP OS / SECURE ACCESS</span>
        <h2>{osAuthStateLabel("DETECTING_WALLET")}</h2>
        <p>Checking for a supported Solana wallet in this browser.</p>
      </section>
    );
  }

  if (host.status === "ready") {
    return (
      <WalletAuthProvider walletOnly>
        <WalletSignIn
          redirectPath={redirectPath}
          variant="app"
          sessionIssue={sessionIssue}
        />
      </WalletAuthProvider>
    );
  }

  return <WalletHostGateway status={host.status} provider={host.provider} />;
}
