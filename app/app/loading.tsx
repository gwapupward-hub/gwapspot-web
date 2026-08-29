import Image from "next/image";

export default function GwapOsLoading() {
  return (
    <main className="auth-gate gwapos-loading" aria-busy="true" aria-live="polite">
      <section className="auth-gate-card">
        <Image
          className="gwapos-loading-mark"
          src="/gwapos/icons/v1/gwapos-icon-transparent-256.png"
          alt=""
          aria-hidden="true"
          width={96}
          height={96}
          priority
          unoptimized
        />
        <span>GWAP OS</span>
        <h1>Securing your workspace…</h1>
      </section>
    </main>
  );
}
