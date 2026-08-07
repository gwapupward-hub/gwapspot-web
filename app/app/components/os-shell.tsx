"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useGwapOs } from "./os-provider";
import { SignOutButton } from "./sign-out-button";

const navigation = [
  { href: "/app", label: "Overview", icon: "◫" },
  { href: "/app/profile", label: "Profile", icon: "◎" },
  { href: "/app/settings", label: "Settings", icon: "⌘" },
] as const;

export function OsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const {
    account,
    keepAccountState,
    migrateLocalState,
    migrationAvailable,
    retrySync,
    state,
    syncStatus,
  } = useGwapOs();

  return (
    <main className="gwap-os">
      <div className="os-aurora os-aurora-one" />
      <div className="os-aurora os-aurora-two" />

      <aside className="os-sidebar" aria-label="GWAP OS navigation">
        <Link className="os-brand" href="/app" aria-label="GWAP OS home">
          <span className="os-brand-mark">
            <Image
              src="/logos/gwap-agent.png"
              alt=""
              width={42}
              height={42}
              priority
            />
          </span>
          <span>
            <strong>GWAP OS</strong>
            <small>Purpose dashboard</small>
          </span>
        </Link>

        <nav className="os-nav">
          {navigation.map((item) => {
            const active =
              item.href === "/app"
                ? pathname === item.href
                : pathname.startsWith(item.href);
            return (
              <Link
                className={active ? "is-active" : undefined}
                href={item.href}
                aria-current={active ? "page" : undefined}
                key={item.href}
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="os-sidebar-links">
          <Link href="/launch">Ecosystem launchpad</Link>
          <Link href="/">Public website</Link>
        </div>

        <div className="os-account-card">
          <span className="os-account-avatar" aria-hidden="true">
            {account.displayName.slice(0, 1).toUpperCase() || "G"}
          </span>
          <span>
            <strong>{account.displayName || state.profile.displayName}</strong>
            <small>
              {account.verifiedWallet.slice(0, 4)}…{account.verifiedWallet.slice(-4)}
            </small>
          </span>
          <div className="os-account-card-actions">
            <i>{syncStatus === "error" ? "Offline" : "Synced"}</i>
            <SignOutButton compact />
          </div>
        </div>
      </aside>

      <section className="os-workspace">
        <header className="os-mobile-header">
          <Link href="/app" aria-label="GWAP OS home">
            <Image src="/logos/gwap-agent.png" alt="" width={36} height={36} />
            <strong>GWAP OS</strong>
          </Link>
          <nav aria-label="Mobile GWAP OS navigation">
            {navigation.map((item) => (
              <Link
                className={
                  item.href === "/app"
                    ? pathname === item.href
                      ? "is-active"
                      : undefined
                    : pathname.startsWith(item.href)
                      ? "is-active"
                      : undefined
                }
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <SignOutButton compact />
        </header>
        {migrationAvailable ? (
          <section className="os-sync-banner" role="status">
            <span>
              <strong>Local Sprint 5 data found</strong>
              <small>Move this device profile, favorites, and settings into your account?</small>
            </span>
            <div>
              <button type="button" onClick={migrateLocalState}>
                Move to account
              </button>
              <button type="button" onClick={keepAccountState}>
                Keep account version
              </button>
            </div>
          </section>
        ) : null}
        {syncStatus === "error" ? (
          <section className="os-sync-banner is-error" role="alert">
            <span>
              <strong>Account sync paused</strong>
              <small>Your latest changes remain safely staged on this device.</small>
            </span>
            <button type="button" onClick={retrySync}>
              Retry sync
            </button>
          </section>
        ) : null}
        {children}
      </section>
    </main>
  );
}
