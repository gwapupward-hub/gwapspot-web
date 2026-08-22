import { ImageResponse } from "next/og";
import { getPublicProofReceipt } from "../../lib/social-proof-control";
import { PUBLIC_PROOF_THEME, normalizePublicProofTheme } from "../../lib/public-proof-brand";

export const runtime = "nodejs";
export const size = { width: 1200, height: 600 };
export const contentType = "image/png";

type Props = { params: Promise<{ code: string }> };

function cardStatus(status: string | undefined) {
  if (status === "verified") return "VERIFIED";
  if (status === "revoked") return "REVOKED";
  if (status === "expired") return "EXPIRED";
  if (status === "awaiting-post") return "POST SUBMITTED";
  return "PUBLIC PROOF";
}

export default async function Image({ params }: Props) {
  const { code } = await params;
  const receipt = await getPublicProofReceipt(code).catch(() => null);
  const themeName = normalizePublicProofTheme(receipt?.shareTheme);
  const theme = PUBLIC_PROOF_THEME[themeName];
  const status = cardStatus(receipt?.status);
  const handle = receipt?.socialHandle ? `@${receipt.socialHandle}` : "GWAP identity";
  const challenge = receipt?.challengeCode || code.toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#030303",
          color: "#ffffff",
        }}
      >
        <img
          src={theme.imageUrl}
          alt=""
          width={1200}
          height={600}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: 42,
            bottom: 38,
            width: 430,
            display: "flex",
            flexDirection: "column",
            padding: "22px 24px",
            border: `2px solid ${theme.accent}`,
            borderRadius: 24,
            backgroundColor: "#050505",
          }}
        >
          <div
            style={{
              display: "flex",
              color: theme.accent,
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: 4,
            }}
          >
            GWAP PUBLIC PROOF
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 10,
              fontSize: 38,
              fontWeight: 900,
              letterSpacing: -1,
            }}
          >
            {handle}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 10,
              fontSize: 16,
              fontWeight: 800,
              color: theme.accent,
            }}
          >
            {status}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 6,
              fontSize: 15,
              color: "#b7b7b7",
            }}
          >
            Proof code: {challenge}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
