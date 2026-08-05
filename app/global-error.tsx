"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({
      level: "fatal",
      message: "root_render_failed",
      error: error.message,
      digest: error.digest,
    }));
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#050505", color: "#f4f6f4", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 32, textAlign: "center" }}>
          <section style={{ maxWidth: 620 }}>
            <p style={{ color: "#ff8a24", letterSpacing: ".16em", fontSize: 12, fontWeight: 800 }}>CORE SYSTEM INTERRUPTION</p>
            <h1 style={{ margin: "18px 0", fontSize: "clamp(42px, 8vw, 76px)", lineHeight: .98 }}>GWAP encountered an unexpected failure.</h1>
            <p style={{ color: "#9aa39c", lineHeight: 1.7 }}>The failure was logged. Retry the application or return later.</p>
            <button onClick={reset} style={{ marginTop: 26, padding: "14px 20px", border: 0, borderRadius: 11, background: "#13dd13", color: "#041104", fontWeight: 800, cursor: "pointer" }}>Retry application</button>
          </section>
        </main>
      </body>
    </html>
  );
}
