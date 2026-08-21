export default function RelationshipGraphLoading() {
  return (
    <div className="os-page os-home-v2">
      <section className="os-runtime-panel os-runtime-note" role="status">
        <span className="os-terminal-label">GWAP://TRUST/RELATIONSHIPS</span>
        <h2>Loading relationship provenance…</h2>
        <p>Resolving canonical account, wallet, GNS, and linked-account relationships.</p>
      </section>
    </div>
  );
}
