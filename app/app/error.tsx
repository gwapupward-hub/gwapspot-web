"use client";

export default function GwapOsError({ reset }: { reset: () => void }) {
  return (
    <main className="auth-gate">
      <section className="auth-gate-card" role="alert">
        <span>GWAP OS / RECOVERY</span>
        <h1>The workspace hit a temporary problem.</h1>
        <p>Your account data remains protected. Retry the request or return later.</p>
        <button className="os-primary-action" type="button" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
