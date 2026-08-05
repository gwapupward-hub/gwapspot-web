"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({
      level: "error",
      message: "route_render_failed",
      error: error.message,
      digest: error.digest,
    }));
  }, [error]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 32, background: "#050505", color: "#f4f6f4", textAlign: "center" }}>
      <section style={{ maxWidth: 620 }}>
        <p style={{ color: "#ff8a24", letterSpacing: ".16em", fontSize: 12, fontWeight: 800 }}>SYSTEM INTERRUPTION</p>
        <h1 style={{ margin: "18px 0", fontSize: "clamp(42px, 8vw, 76px)", lineHeight: .98 }}>That request did not complete.</h1>
        <p style={{ color: "#9aa39c", lineHeight: 1.7 }}>The failure was logged. Retry the request or return to the homepage.</p>
        <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", marginTop: 26 }}>
          <button onClick={reset} style={{ padding: "14px 20px", border: 0, borderRadius: 11, background: "#13dd13", color: "#041104", fontWeight: 800, cursor: "pointer" }}>Retry</button>
          <a href="/" style={{ padding: "14px 20px", borderRadius: 11, border: "1px solid rgba(255,255,255,.18)", color: "white", fontWeight: 800 }}>Return home</a>
        </div>
      </section>
    </main>
  );
}
