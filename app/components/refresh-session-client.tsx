"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export function RefreshSessionClient({
  redirectPath,
  signInPath,
}: {
  redirectPath: string;
  /** The gateway for this host, so the wallet client never detours via /sign-in. */
  signInPath: string;
}) {
  const router = useRouter();
  const { getAccessToken, ready } = usePrivy();
  const started = useRef(false);

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;

    void getAccessToken()
      .then((token) => {
        router.replace(
          token
            ? redirectPath
            : `${signInPath}?redirect_url=${encodeURIComponent(redirectPath)}`,
        );
        router.refresh();
      })
      .catch(() => {
        router.replace(`${signInPath}?redirect_url=${encodeURIComponent(redirectPath)}`);
        router.refresh();
      });
  }, [getAccessToken, ready, redirectPath, router, signInPath]);

  return (
    <main className="auth-gate">
      <section className="auth-gate-card" aria-busy="true">
        <span>GWAP OS / SESSION</span>
        <h1>Refreshing secure access…</h1>
        <p>Your wallet session is being renewed.</p>
      </section>
    </main>
  );
}
