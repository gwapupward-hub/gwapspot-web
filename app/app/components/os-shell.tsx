"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useWalletPortfolio } from "../lib/use-wallet-portfolio";
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
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const copyResetRef = useRef<number | null>(null);
  const portfolio = useWalletPortfolio();

  const handle = useMemo(
    () => gnsIdentity.fullName || shortenWalletAddress(account.verifiedWallet),
    [account.verifiedWallet, gnsIdentity.fullName],
  );

  const balance =
    portfolio.status === "ready" && portfolio.payload.sol.amount !== null
      ? `${portfolio.payload.sol.amount.toFixed(2)} SOL`
      : null;

  async function copyWalletAddress() {
    if (copyResetRef.current) window.clearTimeout(copyResetRef.current);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(account.verifiedWallet);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
    copyResetRef.current = window.setTimeout(() => {
      setCopyStatus("idle");
      copyResetRef.current = null;
    }, 1800);
  }

  return (
    <main className="gwap-os os-v2 gwapos-wallet-mode">
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
          <span className="os-menubar-avatar" aria-hidden="true">
            {gnsIdentity.avatar ? (
              <img src={gnsIdentity.avatar} alt="" />
            ) : (
              handle.charAt(0).toUpperCase()
            )}
          </span>
          <span className="os-status-item">
            <small>IDENTITY</small>
            <span className="os-identity-value">
              <strong>{handle}</strong>
              <button
                type="button"
                className="os-copy-address"
                onClick={() => void copyWalletAddress()}
                aria-label="Copy wallet address"
                title={account.verifiedWallet}
              >
                {copyStatus === "copied" ? "Copied" : copyStatus === "error" ? "Failed" : "Copy"}
              </button>
            </span>
          </span>
          <span className="os-status-item os-trust"><small>TRUST</small><strong>{gnsIdentity.score ?? "—"}</strong></span>
          <span className="os-status-item os-balance">
            <small>{portfolio.status === "error" ? "WALLET" : account.walletProviderLabel.toUpperCase()}</small>
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
