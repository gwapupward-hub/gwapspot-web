"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useGwapOs } from "./os-provider";

const navigation = [
  { href: "/app", label: "Overview", icon: "◫" },
  { href: "/app/profile", label: "Profile", icon: "◎" },
  { href: "/app/settings", label: "Settings", icon: "⌘" },
] as const;

export function OsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state } = useGwapOs();
  const initials = state.profile.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "GW";

  return (
    <main className="gwap-os">
      <div className="os-aurora os-aurora-one" />
      <div className="os-aurora os-aurora-two" />

      <aside className="os-sidebar" aria-label="GWAP OS navigation">
        <Link className="os-brand" href="/app" aria-label="GWAP OS home">
          <span className="os-brand-mark">
            <Image
              src="/logos/gwap-agent-clear.svg"
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
          <span className="os-avatar" aria-hidden="true">
            {initials}
          </span>
          <span>
            <strong>{state.profile.displayName}</strong>
            <small>@{state.profile.handle || "gwap-builder"}</small>
          </span>
          <i>Preview</i>
        </div>
      </aside>

      <section className="os-workspace">
        <header className="os-mobile-header">
          <Link href="/app" aria-label="GWAP OS home">
            <Image src="/logos/gwap-agent-clear.svg" alt="" width={36} height={36} />
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
        </header>
        {children}
      </section>
    </main>
  );
}
