import Link from "next/link";

export default function MarketplacePage() {
  return (
    <div className="os-page os-runtime-page">
      <header className="os-runtime-heading"><span className="os-terminal-label">~/marketplace/browse</span><h1>Marketplace process monitor.</h1><p>The in-OS transaction surface is mounted, but live listings remain gated until a production marketplace API contract is connected to this repository.</p></header>
      <section className="os-runtime-grid">
        <article className="os-runtime-panel">
          <div className="os-console-chrome"><span>marketplace.processes</span><span>ADAPTER REQUIRED</span></div>
          <div className="os-process-table" role="table" aria-label="Marketplace runtime status">
            <div role="row" className="os-process-row os-process-head"><span>PROCESS</span><span>STATE</span><span>ROUTE</span></div>
            <div role="row" className="os-process-row"><span>Listings</span><strong className="state-pending">PENDING</strong><code>GET /listings</code></div>
            <div role="row" className="os-process-row"><span>Escrow</span><strong className="state-pending">PENDING</strong><code>INITIATED → FUNDED → DELIVERED → RELEASED</code></div>
            <div role="row" className="os-process-row"><span>Disputes</span><strong className="state-pending">PENDING</strong><code>SLA / ticket service</code></div>
          </div>
          <p className="os-runtime-warning">No fabricated deal data is shown. This screen will activate when the existing marketplace service is exposed through an authenticated OS-facing adapter.</p>
        </article>
        <aside className="os-runtime-panel os-runtime-note"><span className="os-terminal-label">DEPLOY DEAL</span><h2>Transaction UX is staged.</h2><p>Once the API adapter is connected, this panel becomes the process-row browser, CLI-style filters, deal pipeline, SLA clock, and streaming deploy confirmation described in the OS handoff.</p><Link href="/app">Return home</Link></aside>
      </section>
    </div>
  );
}
