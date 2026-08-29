"use client";

import { osAuthStateLabel } from "../lib/os-auth-state";
import { useWalletHost } from "./use-wallet-host";
import { WalletHostGateway } from "./wallet-host-gateway";
import { WalletSignIn } from "./wallet-sign-in";

// App-domain access surface. Capability-based wallet-host detection decides what
// an ordinary browser sees: supported wallet hosts get the wallet sign-in flow,
// everything else gets the wallet-required gateway. The full GwapOS client is
// never rendered outside a supported wallet host.
export function AppAccessColumn({ redirectPath }: { redirectPath: string }) {
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
    return <WalletSignIn redirectPath={redirectPath} variant="app" />;
  }

  return <WalletHostGateway status={host.status} provider={host.provider} />;
}
