import Image from "next/image";
import Link from "next/link";

const shell = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: "32px",
  background: "radial-gradient(circle at 50% 20%, rgba(19,221,19,.12), transparent 30rem), #050505",
  color: "#f4f6f4",
  textAlign: "center" as const,
};

export default function NotFound() {
  return (
    <main style={shell}>
      <section style={{ maxWidth: 620 }}>
        <Image src="/logo.png" alt="GWAP" width={84} height={84} priority />
        <p style={{ color: "#13dd13", letterSpacing: ".18em", fontSize: 12, fontWeight: 800 }}>404 / ROUTE NOT FOUND</p>
        <h1 style={{ margin: "18px 0", fontSize: "clamp(44px, 9vw, 82px)", lineHeight: .95 }}>This path is not part of the ecosystem.</h1>
        <p style={{ color: "#9aa39c", lineHeight: 1.7, fontSize: 17 }}>The page may have moved, expired, or never existed. Return to the GWAP control center.</p>
        <Link href="/" style={{ display: "inline-flex", marginTop: 26, padding: "14px 20px", borderRadius: 11, background: "#13dd13", color: "#041104", fontWeight: 800 }}>
          Return home
        </Link>
      </section>
    </main>
  );
}
