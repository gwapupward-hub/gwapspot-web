"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchSolBalanceLamports, lamportsToSol } from "../lib/rpc-dedupe";
import { shortenWalletAddress } from "../lib/wallet-format";
import { BootSequence } from "./boot-sequence";
import { CommandPalette } from "./command-palette";
import { GwapActionSheet } from "./gwap-action-sheet";
import { GwapMetalButton } from "./gwap-metal-button";
import { useGwapOs } from "./os-provider";
import { SignOutButton } from "./sign-out-button";

const dock = [
  { href: "/app", label: "Home", icon: "⌂" },
  { href: "/app/identity", label: "Identity", icon: "◎" },
  { href: "/app/vault", label: "Vault", icon: "◇" },
  { href: "/app/activity", label: "Activity", icon: "↗" },
  { href: "/app/apps", label: "Apps", icon: "✦" },
] as const;

function breadcrumb(pathname: string) {
  if (pathname === "/app") return "~/home";
  return `~${pathname.replace(/^\/app/, "")}`;
}

export function OsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const {
    account,
    gnsIdentity,
    keepAccountState,
    migrateLocalState,
    migrationAvailable,
    retrySync,
    state,
    syncStatus,
  } = useGwapOs();
  const [commandOpen, setCommandOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [balance, setBalance] = useState<string>("—");

  const handle = useMemo(
    () => gnsIdentity.fullName || shortenWalletAddress(account.verifiedWallet),
    [account.verifiedWallet, gnsIdentity.fullName],
  );

  useEffect(() => {
    const rpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
    if (!rpc) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3500);

    void fetchSolBalanceLamports(rpc, account.verifiedWallet, {
      signal: controller.signal,
    })
      .then((lamports) => {
        if (typeof lamports === "number") {
          setBalance(`${lamportsToSol(lamports).toFixed(2)} SOL`);
        }
      })
      .catch(() => undefined)
      .finally(() => window.clearTimeout(timer));

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [account.verifiedWallet]);

  return (
    <main className="gwap-os os-v2 gwapos-wallet-mode">
      <style>{`
        .gwapos-mobile-signout { display: none; }
        @media (max-width: 720px) {
          .gwapos-mobile-signout {
            position: fixed;
            top: calc(10px + env(safe-area-inset-top));
            right: 12px;
            z-index: 96;
            display: block;
          }
          .gwapos-mobile-signout .os-sign-out-control {
            display: block;
          }
          .gwapos-mobile-signout .os-sign-out {
            min-height: 36px;
            padding: 0 12px;
            border: 1px solid rgba(255,255,255,.1);
            border-radius: 999px;
            background: rgba(5, 8, 6, .82);
            color: rgba(247,255,247,.82);
            box-shadow: inset 0 1px rgba(255,255,255,.05), 0 10px 28px rgba(0,0,0,.28);
            backdrop-filter: blur(18px) saturate(125%);
            -webkit-backdrop-filter: blur(18px) saturate(125%);
            font: inherit;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: .05em;
          }
          .gwapos-mobile-signout .os-sign-out:disabled {
            opacity: .58;
          }
          .gwapos-mobile-signout .os-sign-out-control > span[role="alert"] {
            position: absolute;
            top: 42px;
            right: 0;
            width: 160px;
            padding: 7px 9px;
            border: 1px solid rgba(255,98,98,.22);
            border-radius: 10px;
            background: rgba(22,6,6,.94);
            color: #ff9a9a;
            font-size: 9px;
          }
        }
      `}</style>
      <div className="os-v2-grid" aria-hidden="true" />
      <div className="os-v2-glow" aria-hidden="true" />
      <BootSequence
        enabled={state.settings.bootAnimation}
        gnsIdentity={gnsIdentity}
        reduceMotion={state.settings.reduceMotion}
      />
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <GwapActionSheet
        open={actionOpen}
        onClose={() => setActionOpen(false)}
        hasGnsIdentity={gnsIdentity.status === "found"}
      />

      <header className="os-menubar">
        <Link href="/app" className="os-menubar-brand" aria-label="GWAP OS home">
          <Image
            src="/gwapos/icons/v1/gwapos-icon-64.png"
            alt=""
            width={32}
            height={32}
            priority
          />
          <span>
            <strong>GWAP OS</strong>
            <small>{breadcrumb(pathname)}</small>
          </span>
        </Link>

        <div className="os-menubar-status" aria-label="Wallet identity status">
          <span className={`os-runtime-dot state-${gnsIdentity.status}`} />
          <span className="os-status-item">
            <small>IDENTITY</small>
            <strong>{handle}</strong>
          </span>
          <span className="os-status-item">
            <small>TRUST</small>
            <strong>{gnsIdentity.score ?? "—"}</strong>
          </span>
          <span className="os-status-item os-balance">
            <small>WALLET</small>
            <strong>{balance}</strong>
          </span>
        </div>

        <div className="os-menubar-actions">
          <button
            type="button"
            className="os-command-trigger"
            onClick={() => setCommandOpen(true)}
            aria-label="Open GWAP command palette"
          >
            <span>✦</span> Ask GWAP
          </button>
          <Link
            href="/app/settings"
            className={pathname.startsWith("/app/settings") ? "is-active" : undefined}
            aria-label="Settings"
          >
            ⚙
          </Link>
          <SignOutButton compact />
        </div>
      </header>

      <div className="gwapos-mobile-signout">
        <SignOutButton compact />
      </div>

      {migrationAvailable ? (
        <section className="os-sync-banner" role="status">
          <span>
            <strong>Local workspace found</strong>
            <small>Choose which account state should become authoritative.</small>
          </span>
          <div>
            <button type="button" onClick={migrateLocalState}>Move to account</button>
            <button type="button" onClick={keepAccountState}>Keep account version</button>
          </div>
        </section>
      ) : null}

      {syncStatus === "error" ? (
        <section className="os-sync-banner is-error" role="alert">
          <span>
            <strong>Account sync paused</strong>
            <small>Changes remain staged on this device.</small>
          </span>
          <button type="button" onClick={retrySync}>Retry sync</button>
        </section>
      ) : null}

      <section className="os-v2-workspace">{children}</section>

      <div className="gwapos-action-fab">
        <GwapMetalButton
          compact
          aria-label="Open GwapOS actions"
          aria-expanded={actionOpen}
          onClick={() => setActionOpen(true)}
        >
          +
        </GwapMetalButton>
      </div>

      <nav className="os-dock" aria-label="GwapOS navigation">
        {dock.map((item) => {
          const active = item.href === "/app" ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? "is-active" : undefined}
              aria-current={active ? "page" : undefined}
            >
              <span aria-hidden="true">{item.icon}</span>
              <small>{item.label}</small>
            </Link>
          );
        })}
      </nav>
    </main>
  );
}
