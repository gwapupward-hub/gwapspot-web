import type { Metadata } from "next";
import Link from "next/link";
import { getPublicProofReceipt } from "../../lib/social-proof-control";
import {
  PUBLIC_PROOF_THEME,
  normalizePublicProofTheme,
} from "../../lib/public-proof-brand";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ theme?: string }>;
};

function statusCopy(status: string) {
  if (status === "verified") return "Verified through GWAP Public Proof";
  if (status === "revoked") return "Verification revoked";
  if (status === "expired") return "Verification challenge expired";
  if (status === "awaiting-post") return "Verification post submitted";
  return "Verification challenge active";
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const receipt = await getPublicProofReceipt(code).catch(() => null);
  const themeName = normalizePublicProofTheme(receipt?.shareTheme || query.theme);
  const theme = PUBLIC_PROOF_THEME[themeName];
  const handle = receipt?.socialHandle ? `@${receipt.socialHandle}` : "GWAP identity";
  const title = `${handle} · GWAP Public Proof`;
  const description = receipt
    ? `${statusCopy(receipt.status)}. Public Proof establishes social-account control through a one-time challenge.`
    : "GWAP Public Proof — verify digital identity through a one-time public challenge.";
  const image = theme.imageUrl || `/v/${encodeURIComponent(code)}/opengraph-image?theme=${themeName}`;

  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: image, width: 1536, height: 768, alt: `${theme.label} GWAP Public Proof` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function PublicProofPage({ params, searchParams }: Props) {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const receipt = await getPublicProofReceipt(code).catch(() => null);
  const themeName = normalizePublicProofTheme(receipt?.shareTheme || query.theme);
  const theme = PUBLIC_PROOF_THEME[themeName];

  if (!receipt) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <section style={{ width: "min(680px,100%)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 24, padding: 32, background: "#090909" }}>
          <span style={{ color: theme.accent, fontSize: 12, letterSpacing: ".15em", fontWeight: 800 }}>GWAP PUBLIC PROOF</span>
          <h1 style={{ fontSize: "clamp(36px,8vw,72px)", margin: "14px 0", letterSpacing: "-.05em" }}>Proof not found.</h1>
          <p style={{ color: "#a6aaa7", lineHeight: 1.7 }}>This verification link is invalid, unavailable, or no longer retained.</p>
          <Link href="/" style={{ display: "inline-block", marginTop: 20, color: theme.accent }}>Explore Tha GwapSpot →</Link>
        </section>
      </main>
    );
  }

  const verified = receipt.status === "verified";
  const status = statusCopy(receipt.status);

  return (
    <main style={{ minHeight: "100vh", background: `radial-gradient(circle at 50% 0%, ${theme.glow}, transparent 36rem), #030303`, color: "#f7f7f7", padding: "44px 20px 80px" }}>
      <div style={{ width: "min(900px,100%)", margin: "0 auto" }}>
        {theme.imageUrl ? (
          <img src={theme.imageUrl} alt={`${theme.label} GWAP Public Proof`} style={{ width: "100%", aspectRatio: "2/1", objectFit: "cover", borderRadius: 26, border: `1px solid ${theme.accent}55`, boxShadow: `0 30px 90px ${theme.glow}` }} />
        ) : null}

        <section style={{ marginTop: 22, border: "1px solid rgba(255,255,255,.12)", borderRadius: 26, padding: "clamp(24px,5vw,44px)", background: "rgba(8,8,8,.92)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <span style={{ color: theme.accent, fontSize: 12, letterSpacing: ".16em", fontWeight: 800 }}>GWAP PUBLIC PROOF</span>
            <span style={{ border: `1px solid ${theme.accent}66`, borderRadius: 999, padding: "7px 11px", color: verified ? theme.accent : "#c3c3c3", fontSize: 11, fontWeight: 800 }}>{receipt.status.toUpperCase()}</span>
          </div>

          <h1 style={{ fontSize: "clamp(42px,9vw,82px)", lineHeight: .95, letterSpacing: "-.055em", margin: "24px 0 16px" }}>@{receipt.socialHandle}</h1>
          <p style={{ fontSize: 18, color: "#c7cbc8", lineHeight: 1.7, maxWidth: 700 }}>{status}.</p>

          <div style={{ marginTop: 30, display: "grid", gap: 1, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 18, overflow: "hidden" }}>
            {[['Method', 'Public post challenge'], ['Platform', 'X'], ['Challenge', receipt.challengeCode], ['Share theme', theme.label], ['Issued', new Date(receipt.issuedAt).toLocaleString()], ['Verified', receipt.verifiedAt ? new Date(receipt.verifiedAt).toLocaleString() : 'Not yet']].map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 20, padding: "15px 18px", background: "#0b0b0b" }}>
                <span style={{ color: "#777f79" }}>{label}</span>
                <strong style={{ textAlign: "right" }}>{value}</strong>
              </div>
            ))}
          </div>

          {receipt.postUrl ? <a href={receipt.postUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 22, color: theme.accent }}>View public proof post ↗</a> : null}
        </section>

        <section style={{ marginTop: 22, border: `1px solid ${theme.accent}44`, borderRadius: 26, padding: "clamp(24px,5vw,40px)", background: `linear-gradient(135deg, ${theme.glow}, rgba(8,8,8,.96) 45%)` }}>
          <span style={{ fontSize: 12, letterSpacing: ".16em", fontWeight: 800, color: theme.accent }}>BUILD YOUR DIGITAL TRUST</span>
          <h2 style={{ fontSize: "clamp(30px,6vw,54px)", letterSpacing: "-.045em", margin: "14px 0" }}>Turn identity into leverage.</h2>
          <p style={{ color: "#c2c6c3", lineHeight: 1.7, maxWidth: 680 }}>Claim a .gwap identity, connect verified accounts, understand your reputation, and build a portable trust profile inside GWAP OS.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24 }}>
            <Link href="/app" style={{ background: theme.accent, color: themeName === 'silver' ? '#000' : '#050505', padding: "13px 18px", borderRadius: 12, fontWeight: 800 }}>Open GWAP OS</Link>
            <Link href="/" style={{ border: "1px solid rgba(255,255,255,.18)", padding: "13px 18px", borderRadius: 12, fontWeight: 800 }}>Explore Tha GwapSpot</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
