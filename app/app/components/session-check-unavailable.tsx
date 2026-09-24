export function SessionCheckUnavailable() {
  return (
    <main className="auth-gate">
      <div className="auth-gate-glow" aria-hidden="true" />
      <section className="auth-gate-card">
        <span>GWAP OS / SESSION</span>
        <h1>We couldn&rsquo;t confirm your session just now.</h1>
        <p>
          Your sign-in looked fine, but checking the authenticated identity
          against the server didn&rsquo;t complete. This can happen briefly while
          an email-created Solana wallet finishes provisioning. Your session was
          not signed out.
        </p>
        <div>
          <a className="os-primary-action" href="/app">
            Try again
          </a>
        </div>
      </section>
    </main>
  );
}
