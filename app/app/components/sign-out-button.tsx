"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GWAP_OS_STORAGE_KEY } from "../lib/os-state";

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { logout } = usePrivy();
  const { connected, disconnect } = useWallet();
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setWorking(true);
    setFailed(false);
    try {
      if (connected) await disconnect().catch(() => undefined);
      await logout();
      window.localStorage.removeItem(GWAP_OS_STORAGE_KEY);
      router.replace("/");
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setWorking(false);
    }
  }

  return (
    <span className="os-sign-out-control">
      <button
        className={compact ? "os-sign-out is-compact" : "os-sign-out"}
        type="button"
        disabled={working}
        onClick={() => void signOut()}
      >
        {working ? "Signing out…" : failed ? "Retry sign out" : "Sign out"}
      </button>
      {failed ? <span role="alert">Session remains active.</span> : null}
    </span>
  );
}
