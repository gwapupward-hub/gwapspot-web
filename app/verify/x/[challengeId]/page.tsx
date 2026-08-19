import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { GWAPSCORE_PUBLIC_ORIGIN } from "../../../lib/gwapscore-social/core";
import { getChallenge, getSocialAccount } from "../../../lib/gwapscore-social/store";
import type { VerificationCardTheme } from "../../../lib/gwapscore-social/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FALLBACK_THEME: VerificationCardTheme = "green";

async function getPublicProof(challengeId: string) {
  const challenge = await getChallenge(challengeId);
  if (!challenge || challenge.platform !== "x") return null;
  const account = await getSocialAccount(challenge.socialAccountId);
  if (!account || account.platform !== "x") return null;
  return { challenge, account };
}

function proofLabel(state: "active" | "consumed" | "expired" | "revoked") {
  if (state === "consumed") return "VERIFIED";
  if (state === "active") return "VERIFICATION IN PROGRESS";
  if (state === "expired") return "CHALLENGE EXPIRED";
  return "CHALLENGE REVOKED";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ challengeId: string }>;
}): Promise<Metadata> {
  const { challengeId } = await params;
  const proof = await getPublicProof(challengeId);
  const theme = proof?.challenge.cardTheme ?? FALLBACK_THEME;
  const handle = proof?.account.currentUsername ?? "X account";
  const imageUrl = `${GWAPSCORE_PUBLIC_ORIGIN}/verify/x/card/${theme}`;
  const title = `@${handle} — GwapScore Proof of Control`;
  const description =
    "Public Proof of Control for an X account through GwapScore. Verification establishes account control only and does not represent a reputation score.";

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      url: `${GWAPSCORE_PUBLIC_ORIGIN}/verify/x/${encodeURIComponent(challengeId)}`,
      siteName: "GwapScore",
      title,
      description,
      images: [{ url: imageUrl, width: 1200, height: 600, alt: "GWAP Proof of Control" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function XProofPage({
  params,
}: {
  params: Promise<{ challengeId: string }>;
}) {
  const { challengeId } = await params;
  const proof = await getPublicProof(challengeId);
  if (!proof) notFound();

  const { challenge, account } = proof;
  const theme = challenge.cardTheme ?? FALLBACK_THEME;
  const status = proofLabel(challenge.state);
  const proofPostUrl = account.verificationProofPostId
    ? `https://x.com/${encodeURIComponent(account.currentUsername)}/status/${encodeURIComponent(account.verificationProofPostId)}`
    : null;

  return (
    <main
      style={{
        minHeight: "100dvh",
        background: "#030504",
        color: "#fff",
        display: "grid",
        placeItems: "center",
        padding: "32px 18px",
      }}
    >
      <section
        style={{
          width: "min(820px, 100%)",
          display: "grid",
          gap: 22,
          padding: 22,
          border: "1px solid rgba(255,255,255,.1)",
          borderRadius: 24,
          background: "rgba(255,255,255,.035)",
        }}
      >
        <Image
          src={`/verify/x/card/${theme}`}
          width={1200}
          height={600}
          unoptimized
          priority
          alt={`${theme} GWAP Proof of Control card`}
          style={{ width: "100%", height: "auto", borderRadius: 18 }}
        />

        <div style={{ display: "grid", gap: 10 }}>
          <span style={{ fontSize: 12, letterSpacing: ".14em", opacity: 0.58 }}>
            GWAPSCORE · X PROOF OF CONTROL
          </span>
          <h1 style={{ margin: 0, fontSize: "clamp(30px, 7vw, 54px)" }}>
            @{account.currentUsername}
          </h1>
          <strong style={{ fontSize: 14, letterSpacing: ".08em" }}>{status}</strong>
          <p style={{ margin: 0, lineHeight: 1.65, color: "rgba(255,255,255,.68)" }}>
            This public page provides context for a GwapScore Proof of Control challenge. It
            establishes whether the claimed X account completed the verification flow. It does not
            represent trustworthiness, popularity, legitimacy, confidence, or a reputation score.
          </p>
        </div>

        {proofPostUrl ? (
          <a
            href={proofPostUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              justifySelf: "start",
              color: "#fff",
              textDecoration: "none",
              padding: "12px 16px",
              border: "1px solid rgba(255,255,255,.18)",
              borderRadius: 12,
            }}
          >
            View public proof post on X
          </a>
        ) : null}

        <small style={{ color: "rgba(255,255,255,.42)" }}>
          Preview color: {theme}. Color is aesthetic only and has no effect on verification or
          GwapScore.
        </small>
      </section>
    </main>
  );
}
