import Link from "next/link";

export default function VaultPage() {
  return (
    <div className="os-page os-runtime-page">
      <header className="os-runtime-heading"><span className="os-terminal-label">~/vault</span><h1>Private Proof Vault.</h1><p>A privacy-aware proof workspace is reserved inside GWAP OS. No proof bytes or sensitive evidence are stored in the browser by this placeholder runtime.</p></header>
      <section className="os-runtime-grid">
        <article className="os-runtime-panel os-vault-console"><div className="os-console-chrome"><span>ppv.mount</span><span>LOCKED</span></div><div className="os-vault-lock" aria-hidden="true">◇</div><h2>Vault service not connected.</h2><p>Permissioning, proof schema, encrypted storage, and selective sharing must be mounted before writes are enabled.</p></article>
        <aside className="os-runtime-panel os-runtime-note"><span className="os-terminal-label">SECURITY DEFAULT</span><h2>Fail closed.</h2><p>GWAP OS will not simulate private storage or persist sensitive proof content until the PPV service and authorization model are production-ready.</p><Link href="/app">Return home</Link></aside>
      </section>
    </div>
  );
}
