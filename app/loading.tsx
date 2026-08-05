export default function Loading() {
  return (
    <main aria-live="polite" aria-busy="true" style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#050505", color: "#f4f6f4" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 12, height: 12, margin: "0 auto 18px", borderRadius: 999, background: "#13dd13", boxShadow: "0 0 24px #13dd13" }} />
        <p style={{ margin: 0, color: "#9aa39c", fontSize: 12, fontWeight: 800, letterSpacing: ".16em" }}>LOADING GWAP</p>
      </div>
    </main>
  );
}
