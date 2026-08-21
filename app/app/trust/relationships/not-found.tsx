import Link from "next/link";

export default function RelationshipGraphNotFound() {
  return (
    <div className="os-page os-home-v2">
      <section className="os-runtime-panel os-runtime-note">
        <span className="os-terminal-label">GWAP://TRUST/RELATIONSHIPS</span>
        <h2>Relationship Graph is unavailable.</h2>
        <p>Return to Trust Graph and retry from the authenticated GWAP OS session.</p>
        <Link href="/app/trust">Return to Trust Graph →</Link>
      </section>
    </div>
  );
}
