import { ImageResponse } from "next/og";
import { getPublicProofReceipt } from "../../lib/social-proof-control";
import { PUBLIC_PROOF_THEME } from "../../lib/public-proof-brand";

export const runtime = "nodejs";
export const size = { width: 1536, height: 768 };
export const contentType = "image/png";

type Props = { params: Promise<{ code: string }> };

export default async function Image({ params }: Props) {
  const { code } = await params;
  const receipt = await getPublicProofReceipt(code).catch(() => null);
  const theme = PUBLIC_PROOF_THEME[receipt?.shareTheme || "green"];
  const status = receipt?.status === "verified" ? "VERIFIED" : "PUBLIC PROOF";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          alignItems: "center",
          justifyContent: "center",
          background: `radial-gradient(circle at 50% 45%, ${theme.accent} 0%, ${theme.accent} 18%, #111 65%, #020202 100%)`,
          color: "white",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            width: 690,
            height: 690,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#020202",
            borderRadius: 240,
            boxShadow: `0 0 90px ${theme.glow}`,
          }}
        >
          <div
            style={{
              width: 66,
              height: 66,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: `3px solid ${theme.accent}`,
              borderRadius: 999,
              color: theme.accent,
              fontSize: 28,
              fontWeight: 900,
              marginBottom: 10,
            }}
          >
            G
          </div>
          <div style={{ fontSize: 150, fontWeight: 900, letterSpacing: -10, color: "#030303", WebkitTextStroke: `5px ${theme.accent}` }}>GWAP</div>
          <div style={{ marginTop: 22, fontSize: 26, letterSpacing: 9, color: theme.accent, fontWeight: 800 }}>{status}</div>
          <div style={{ marginTop: 14, fontSize: 34, fontWeight: 800 }}>@{receipt?.socialHandle || "identity"}</div>
          <div style={{ marginTop: 12, fontSize: 20, color: "#b7b7b7" }}>{receipt?.challengeCode || code.toUpperCase()}</div>
        </div>
      </div>
    ),
    size,
  );
}
