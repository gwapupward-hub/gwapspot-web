import Link from "next/link";
import { getPpvWorkspaceReadiness } from "../../lib/ppv/readiness.server";
import styles from "./ppv.module.css";

export const dynamic = "force-dynamic";

const layerCopy = {
  core: {
    kicker: "CORE",
    title: "Proofs",
    description: "Commit evidence, verify exact bytes, preserve revocation history.",
  },
  commerce: {
    kicker: "COMMERCE",
    title: "Agreements",
    description: "Review and sign the exact version, terms hash and counterparties.",
  },
  escrow: {
    kicker: "ESCROW",
    title: "Execution",
    description: "Test-asset custody flows only after the exact deployed binary is approved.",
  },
} as const;

const statusLabel = {
  disabled: "Disabled",
  unavailable: "Unavailable",
  read_only: "Read only",
  ready: "Ready",
} as const;

export default async function PpvWorkspacePage() {
  const readiness = await getPpvWorkspaceReadiness();

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.kicker}>PRIVATE PROOF VAULT · GWAPOS</p>
          <h1>Prove it. Agree to it. Execute by the rules.</h1>
          <p className={styles.lede}>
            One workspace for PPV Core, Commerce and Escrow. Network truth is checked
            independently; a green feature flag never makes a deployment compatible.
          </p>
        </div>
        <div className={styles.network}>
          <span>DEVNET</span>
          <strong>TEST ASSETS ONLY</strong>
          <small>Mainnet and real-value custody are hard-disabled in this release.</small>
        </div>
      </section>

      <nav className={styles.nav} aria-label="PPV workspace">
        <Link href="/app/ppv">Overview</Link>
        <Link href="/app/ppv/proofs">Proofs</Link>
        <Link href="/app/ppv/agreements">Agreements</Link>
        <Link href="/app/ppv/escrow">Escrow</Link>
        <Link href="/app/ppv/activity">Activity</Link>
        <Link href="/app/vault/receipts">Receipts</Link>
      </nav>

      <section className={styles.statusStrip} aria-label="PPV readiness summary">
        <div>
          <span>Integration</span>
          <strong>{readiness.enabled ? "Requested" : "Disabled"}</strong>
        </div>
        <div>
          <span>Manifest</span>
          <strong>{readiness.manifest.reviewStatus.replaceAll("_", " ")}</strong>
        </div>
        <div>
          <span>Cluster</span>
          <strong>{readiness.cluster}</strong>
        </div>
        <div>
          <span>Last check</span>
          <strong>{new Date(readiness.checkedAt).toLocaleTimeString("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" })} UTC</strong>
        </div>
      </section>

      <section className={styles.layers} aria-label="PPV layers">
        {(Object.keys(layerCopy) as Array<keyof typeof layerCopy>).map((layer) => {
          const copy = layerCopy[layer];
          const capability = readiness.layers[layer];
          const program = readiness.programs[layer];
          return (
            <article className={styles.layer} key={layer}>
              <header>
                <span>{copy.kicker}</span>
                <b className={styles[capability.state]}>{statusLabel[capability.state]}</b>
              </header>
              <h2>{copy.title}</h2>
              <p>{copy.description}</p>
              <dl>
                <div><dt>Program</dt><dd>{program.programId.slice(0, 6)}…{program.programId.slice(-6)}</dd></div>
                <div><dt>Chain status</dt><dd>{program.status.replaceAll("_", " ")}</dd></div>
                <div><dt>Write blocker</dt><dd>{capability.reasonCode ?? "None"}</dd></div>
              </dl>
            </article>
          );
        })}
      </section>

      <section className={styles.work}>
        <div>
          <p className={styles.sectionKicker}>WORKSPACE</p>
          <h2>The product is integrated before custody is activated.</h2>
          <p>
            Readiness and history can ship independently. Mutation controls stay unavailable
            until their own program, SDK, IDL, binary and deployment evidence all match.
          </p>
        </div>
        <div className={styles.actionGrid}>
          <Link href="/app/ppv/proofs"><strong>Proofs</strong><span>Create · verify · revoke</span></Link>
          <Link href="/app/ppv/agreements"><strong>Agreements</strong><span>Draft · review · sign · revise</span></Link>
          <Link href="/app/ppv/escrow"><strong>Escrow</strong><span>Test assets · evidence · settlement</span></Link>
          <Link href="/app/ppv/activity"><strong>Activity</strong><span>Pending vs finalized history</span></Link>
        </div>
      </section>

      <aside className={styles.notice}>
        <strong>Current public-devnet blockers are explicit.</strong>
        <p>
          Commerce is not currently deployed at its canonical devnet ID. The observed
          Escrow deployment is the older pre-RR13-001 binary. Core is observable, but
          writes stay gated until current SDK/IDL/binary compatibility is attested.
        </p>
      </aside>
    </div>
  );
}
