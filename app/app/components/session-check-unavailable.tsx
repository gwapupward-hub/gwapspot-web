export function SessionCheckUnavailable() {
  return (
    <main className="auth-gate">
      <div className="auth-gate-glow" aria-hidden="true" />
      <section className="auth-gate-card">
        <span>GWAP OS / SESSION</span>
        <h1>We couldn&rsquo;t confirm your session just now.</h1>
        <p>
          Your wallet sign-in looked fine, but checking it against the server
          didn&rsquo;t complete. This is usually temporary. Your session was not
          signed out.
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
