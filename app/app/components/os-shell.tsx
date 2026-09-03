"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { useWalletPortfolio } from "../lib/use-wallet-portfolio";
import { BootSequence } from "./boot-sequence";
import { CommandPalette } from "./command-palette";
import { useGwapOs } from "./os-provider";
import { SignOutButton } from "./sign-out-button";

const dock = [
  { href: "/app", label: "Home", icon: "⌂" },
  { href: "/app/ideas", label: "Discover", icon: "✦" },
  { href: "/app/marketplace", label: "Work", icon: "▤" },
  { href: "/app/identity", label: "Identity", icon: "◎" },
  { href: "/app/vault", label: "Proof", icon: "◇" },
  { href: "/app/trust", label: "Trust", icon: "↗" },
  { href: "/app/developer", label: "Build", icon: "{}" },
] as const;

function compactWallet(wallet: string) {
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

function breadcrumb(pathname: string) {
  if (pathname === "/app") return "~/home";
  return `~${pathname.replace(/^\/app/, "")}`;
}

export function OsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { account, gnsIdentity, keepAccountState, migrateLocalState, migrationAvailable, retrySync, state, syncStatus } = useGwapOs();
  const [commandOpen, setCommandOpen] = useState(false);
  const portfolio = useWalletPortfolio();

  const handle = useMemo(
    () => gnsIdentity.fullName || compactWallet(account.verifiedWallet),
    [account.verifiedWallet, gnsIdentity.fullName],
  );

  const balance =
    portfolio.status === "ready" && portfolio.payload.sol.amount !== null
      ? `${portfolio.payload.sol.amount.toFixed(2)} SOL`
      : null;

  return (
    <main className="gwap-os os-v2">
      <div className="os-v2-grid" aria-hidden="true" />
      <div className="os-v2-glow" aria-hidden="true" />
      <BootSequence enabled={state.settings.bootAnimation} gnsIdentity={gnsIdentity} reduceMotion={state.settings.reduceMotion} />
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />

      <header className="os-menubar">
        <Link href="/app" className="os-menubar-brand" aria-label="GWAP OS home">
          <Image src="/logos/gwap-agent.png" alt="" width={32} height={32} priority />
          <span><strong>GWAP OS</strong><small>{breadcrumb(pathname)}</small></span>
        </Link>

        <div className="os-menubar-status" aria-label="Wallet identity status">
          <span className={`os-runtime-dot state-${gnsIdentity.status}`} />
          <span className="os-status-item"><small>IDENTITY</small><strong>{handle}</strong></span>
          <span className="os-status-item"><small>TRUST</small><strong>{gnsIdentity.score ?? "—"}</strong></span>
          <span className="os-status-item os-balance">
            <small>WALLET</small>
            {portfolio.status === "error" ? (
              <button type="button" className="os-balance-retry" onClick={portfolio.refetch}>
                Retry
              </button>
            ) : (
              <strong>{balance ?? "—"}</strong>
            )}
          </span>
        </div>

        <div className="os-menubar-actions">
          <button type="button" className="os-command-trigger" onClick={() => setCommandOpen(true)} aria-label="Open GWAP action bar">
            <span>✦</span> Ask GWAP
          </button>
          <Link href="/app/settings" className={pathname.startsWith("/app/settings") ? "is-active" : undefined} aria-label="Settings">⚙</Link>
          <SignOutButton compact />
        </div>
      </header>

      {migrationAvailable ? (
        <section className="os-sync-banner" role="status">
          <span><strong>Local workspace found</strong><small>Choose which account state should become authoritative.</small></span>
          <div><button type="button" onClick={migrateLocalState}>Move to account</button><button type="button" onClick={keepAccountState}>Keep account version</button></div>
        </section>
      ) : null}
      {syncStatus === "error" ? (
        <section className="os-sync-banner is-error" role="alert">
          <span><strong>Account sync paused</strong><small>Changes remain staged on this device.</small></span>
          <button type="button" onClick={retrySync}>Retry sync</button>
        </section>
      ) : null}

      <section className="os-v2-workspace">{children}</section>

      <nav className="os-dock" aria-label="GWAP OS outcomes">
        {dock.map((item) => {
          const active = item.href === "/app" ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}>
              <span aria-hidden="true">{item.icon}</span><small>{item.label}</small>
            </Link>
          );
        })}
      </nav>
    </main>
  );
}
