import Link from "next/link";
import { getPpvWorkspaceReadiness, type PpvCapability } from "../../lib/ppv/readiness.server";
import styles from "./ppv.module.css";

type SectionPageProps = {
  layer: "core" | "commerce" | "escrow";
  kicker: string;
  title: string;
  description: string;
  actions: readonly { key: string; label: string; detail: string }[];
};

const stateCopy: Record<PpvCapability["state"], string> = {
  disabled: "Disabled",
  unavailable: "Unavailable",
  read_only: "Read only",
  ready: "Ready",
};

export async function PpvSectionPage({
  layer,
  kicker,
  title,
  description,
  actions,
}: SectionPageProps) {
  const readiness = await getPpvWorkspaceReadiness();
  const program = readiness.programs[layer];
  const layerState = readiness.layers[layer];

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.kicker}>{kicker} · DEVNET · TEST ASSETS ONLY</p>
          <h1>{title}</h1>
          <p className={styles.lede}>{description}</p>
        </div>
        <div className={styles.network}>
          <span>{stateCopy[layerState.state]}</span>
          <strong>{layerState.reasonCode ?? "Verified"}</strong>
          <small>{program.status.replaceAll("_", " ")}</small>
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

      <section className={styles.layers}>
        {actions.map((action) => {
          const capability = readiness.actions[action.key] ?? {
            state: "unavailable" as const,
            reasonCode: "ACTION_NOT_IMPLEMENTED",
          };
          return (
            <article className={styles.layer} key={action.key}>
              <header>
                <span>{action.label.toUpperCase()}</span>
                <b className={styles[capability.state]}>{stateCopy[capability.state]}</b>
              </header>
              <h2>{action.label}</h2>
              <p>{action.detail}</p>
              <dl>
                <div><dt>Status</dt><dd>{capability.state}</dd></div>
                <div><dt>Reason</dt><dd>{capability.reasonCode ?? "None"}</dd></div>
              </dl>
            </article>
          );
        })}
      </section>

      <aside className={styles.notice}>
        <strong>No wallet prompt is generated from this screen while readiness is blocked.</strong>
        <p>
          PPV mutations require fresh server-side network, deployment, artifact and actor checks.
          Client state cannot override those gates.
        </p>
      </aside>
    </div>
  );
}
