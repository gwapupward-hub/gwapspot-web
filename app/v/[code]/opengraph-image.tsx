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
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#030303",
          color: "#ffffff",
        }}
      >
        <div
          style={{
            width: 1180,
            height: 570,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            border: `5px solid ${theme.accent}`,
            borderRadius: 80,
            backgroundColor: "#080808",
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: `4px solid ${theme.accent}`,
              borderRadius: 999,
              color: theme.accent,
              fontSize: 30,
              fontWeight: 900,
              marginBottom: 20,
            }}
          >
            G
          </div>
          <div style={{ display: "flex", fontSize: 122, fontWeight: 900, letterSpacing: -6, color: theme.accent }}>GWAP</div>
          <div style={{ display: "flex", marginTop: 18, fontSize: 28, letterSpacing: 8, color: theme.accent, fontWeight: 800 }}>{status}</div>
          <div style={{ display: "flex", marginTop: 18, fontSize: 38, fontWeight: 800 }}>@{receipt?.socialHandle || "identity"}</div>
          <div style={{ display: "flex", marginTop: 14, fontSize: 22, color: "#b7b7b7" }}>{receipt?.challengeCode || code.toUpperCase()}</div>
        </div>
      </div>
    ),
    size,
  );
}
