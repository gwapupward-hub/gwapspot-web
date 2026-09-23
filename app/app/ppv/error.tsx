"use client";

import { useEffect } from "react";
import styles from "./ppv.module.css";

export default function PpvError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("ppv_workspace_error", { name: error.name, digest: error.digest });
  }, [error]);

  return (
    <div className={styles.page}>
      <section className={styles.error}>
        <p className={styles.kicker}>PPV UNAVAILABLE</p>
        <h1>The PPV workspace hit an isolated error.</h1>
        <p>GwapOS remains available. Retry PPV without changing your wallet or portfolio network.</p>
        <button type="button" onClick={reset}>Retry PPV</button>
      </section>
    </div>
  );
}
