import Image from "next/image";
import Link from "next/link";
import { createPageMetadata } from "../lib/metadata";

export const metadata = createPageMetadata({
  title: "Terms of Use",
  description:
    "Review the terms governing access to the public GWAP website and its ecosystem information.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <main className="legal-page">
      <Link className="brand" href="/">
        <span className="brand-mark"><Image src="/logo.png" alt="" width={40} height={40} /></span>
        <span className="brand-copy"><strong>GWAP</strong><small>Grind With A Purpose</small></span>
      </Link>
      <p className="eyebrow">Legal</p>
      <h1>Terms of Use</h1>
      <p>Last updated: August 2026</p>
      <p>These initial terms govern access to the public GWAP website. Separate products may publish additional terms that apply to their services.</p>
      <h2>Informational website</h2>
      <p>Website content is provided for general informational purposes. Product descriptions, availability, development status, and roadmap items may change.</p>
      <h2>No financial advice</h2>
      <p>Nothing on this website constitutes investment, legal, tax, credit, or other professional advice. Digital assets and blockchain applications involve risk.</p>
      <h2>Acceptable use</h2>
      <p>Visitors must not interfere with site operation, attempt unauthorized access, distribute malicious code, or use the website in violation of applicable law.</p>
      <h2>External services</h2>
      <p>GWAP is not responsible for the availability or practices of third-party websites linked from this site.</p>
      <p><Link href="/">Return to GWAP</Link></p>
    </main>
  );
}
