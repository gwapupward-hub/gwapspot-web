"use client";

import Link from "next/link";
import { ecosystemProducts } from "../../lib/ecosystem";
import { shortenWalletAddress } from "../lib/wallet-format";
import { useGwapOs } from "../components/os-provider";

export default function ActivityPage() {
  const { account, gnsIdentity, state, syncStatus } = useGwapOs();
  const recent = state.recent.map((item) => ({
    ...item,
    product: ecosystemProducts.find((product) => product.slug === item.slug),
  }));

  return (
    <div className="gwapos-home">
      <div className="gwapos-section-head">
        <div>
          <p className="gwapos-kicker">Activity</p>
          <h2>What happened around your GwapOS identity</h2>
        </div>
        <p>{syncStatus}</p>
      </div>

      <section className="gwapos-pulse" aria-label="GwapOS activity">
        <div className="gwapos-pulse-row">
          <span aria-hidden="true">✓</span>
          <div>
            <p>Wallet authenticated</p>
            <small>{shortenWalletAddress(account.verifiedWallet)}</small>
          </div>
          <strong>Wallet</strong>
        </div>

        <div className="gwapos-pulse-row">
          <span aria-hidden="true">◎</span>
          <div>
            <p>{gnsIdentity.fullName || "Identity pending"}</p>
            <small>{gnsIdentity.status === "found" ? "Primary .gwap identity resolved" : "GNS identity is not active yet"}</small>
          </div>
          <strong>Identity</strong>
        </div>

        {recent.map((item) => (
          <Link
            className="gwapos-pulse-row"
            href={item.product?.internalUrl || "/app/apps"}
            key={`${item.slug}-${item.openedAt}`}
          >
            <span aria-hidden="true">✦</span>
            <div>
              <p>{item.product?.name || item.slug}</p>
              <small>Opened {new Date(item.openedAt).toLocaleString()}</small>
            </div>
            <strong>App</strong>
          </Link>
        ))}

        {!recent.length ? (
          <div className="gwapos-pulse-row">
            <span aria-hidden="true">•</span>
            <div>
              <p>No application history yet</p>
              <small>Your meaningful GwapOS events will collect here.</small>
            </div>
            <strong>Ready</strong>
          </div>
        ) : null}
      </section>
    </div>
  );
}
