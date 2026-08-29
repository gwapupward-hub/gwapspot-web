import Link from "next/link";

const apps = [
  {
    href: "/app/identity",
    name: "GNS Identity",
    note: ".gwap identity, wallet profile, and account context",
    icon: "◎",
    status: "Live",
  },
  {
    href: "/app/score",
    name: "GwapScore",
    note: "Reputation and trust signals attached to your identity",
    icon: "↗",
    status: "Live",
  },
  {
    href: "/app/vault",
    name: "Private Proof Vault",
    note: "Proofs, agreements, invoices, and verifiable commerce tools",
    icon: "◇",
    status: "Build",
  },
  {
    href: "/app/ideas",
    name: "Daily Ideas 2.0",
    note: "Discover, save, develop, validate, build, and launch ideas",
    icon: "✦",
    status: "Live",
  },
  {
    href: "/app/marketplace",
    name: "Marketplace",
    note: "Identity-aware work, services, and ecosystem commerce",
    icon: "▤",
    status: "Build",
  },
  {
    href: "/app/developer",
    name: "Developer",
    note: "GWAP integration and developer tools",
    icon: "{}",
    status: "Tools",
  },
] as const;

export default function AppsPage() {
  return (
    <div className="gwapos-home">
      <div className="gwapos-section-head">
        <div>
          <p className="gwapos-kicker">Apps</p>
          <h2>Your GwapOS tools</h2>
        </div>
        <p>{apps.length} available</p>
      </div>

      <section className="gwapos-pulse" aria-label="GwapOS apps">
        {apps.map((app) => (
          <Link className="gwapos-pulse-row" href={app.href} key={app.href}>
            <span aria-hidden="true">{app.icon}</span>
            <div>
              <p>{app.name}</p>
              <small>{app.note}</small>
            </div>
            <strong>{app.status}</strong>
          </Link>
        ))}
      </section>
    </div>
  );
}
