import type { WalletClassification } from "../lib/wallet-host-detection";

export function WalletHostRequired({
  reason,
}: {
  reason: Exclude<WalletClassification["status"], "ready">;
}) {
  return (
    <section className="wallet-auth-card">
      <span className="wallet-auth-eyebrow">GWAP OS / WALLET BROWSER REQUIRED</span>
      <h2>Open GWAP OS inside your wallet.</h2>
      <p>
        {reason === "unsupported"
          ? "The wallet browser you're using can't sign the ownership message GWAP OS needs."
          : "GWAP OS runs inside a Solana wallet's built-in browser, not an ordinary one."}{" "}
        Open this page from inside Phantom or Jupiter to continue.
      </p>

      <div className="wallet-auth-actions">
        <a className="os-primary-action" href="https://phantom.app" target="_blank" rel="noopener noreferrer">
          Get Phantom
        </a>
        <a className="os-primary-action" href="https://jup.ag" target="_blank" rel="noopener noreferrer">
          Get Jupiter
        </a>
      </div>

      <p className="wallet-auth-legal">
        Already have one installed? Copy this page&rsquo;s link and open it from
        the wallet app&rsquo;s own browser tab.
      </p>
    </section>
  );
}
