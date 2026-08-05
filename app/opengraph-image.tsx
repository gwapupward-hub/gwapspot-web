import { ImageResponse } from "next/og";

export const alt = "GWAP — One Ecosystem. Built With Purpose.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "radial-gradient(circle at 78% 25%, rgba(19,221,19,.24), transparent 32%), #050505",
          color: "#f4f6f4",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 58, height: 58, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 15, border: "1px solid rgba(19,221,19,.5)", color: "#13dd13", fontSize: 24, fontWeight: 900 }}>G</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 28, fontWeight: 900, letterSpacing: ".16em" }}>GWAP</span>
            <span style={{ marginTop: 6, color: "#9aa39c", fontSize: 14, letterSpacing: ".12em" }}>GRIND WITH A PURPOSE</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ color: "#13dd13", fontSize: 20, fontWeight: 800, letterSpacing: ".14em" }}>THE OFFICIAL ECOSYSTEM</span>
          <div style={{ marginTop: 22, maxWidth: 980, fontSize: 76, lineHeight: .94, fontWeight: 900, letterSpacing: "-.055em" }}>One ecosystem. Built with purpose.</div>
          <div style={{ marginTop: 28, color: "#aeb7b0", fontSize: 25 }}>Identity · Reputation · Commerce · Creativity · AI · Community</div>
        </div>
      </div>
    ),
    size,
  );
}
