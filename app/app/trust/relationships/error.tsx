"use client";

export default function RelationshipGraphError({ reset }: { reset: () => void }) {
  return (
    <div className="os-page os-home-v2">
      <section className="os-runtime-panel os-runtime-note" role="alert">
        <span className="os-terminal-label">GWAP://TRUST/RELATIONSHIPS</span>
        <h2>Relationship Graph could not load.</h2>
        <p>This is an application error, not a negative trust event. Your Trust Coverage and GwapScore are not changed.</p>
        <button type="button" onClick={reset}>Retry relationship graph</button>
      </section>
    </div>
  );
}
