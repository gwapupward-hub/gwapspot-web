import Link from "next/link";

export function AuthSetupRequired() {
  return (
    <main className="auth-gate">
      <div className="auth-gate-glow" aria-hidden="true" />
      <section className="auth-gate-card">
        <span>GWAP OS / WALLET SETUP</span>
        <h1>Wallet access is ready for activation.</h1>
        <p>
          The workspace stays locked until Privy wallet authentication and
          Upstash workspace storage are configured for this environment. Public
          GWAP pages remain available.
        </p>
        <div>
          <Link className="os-primary-action" href="/">
            Return to GWAPSpot
          </Link>
          <span className="auth-gate-link">Deployment setup required</span>
        </div>
      </section>
    </main>
  );
}
