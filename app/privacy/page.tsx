import Image from "next/image";
import Link from "next/link";
import { createPageMetadata } from "../lib/metadata";

export const metadata = createPageMetadata({
  title: "Privacy Policy",
  description:
    "Learn how the public GWAP website handles technical, analytics, and contact information.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <Link className="brand" href="/">
        <span className="brand-mark"><Image src="/logo.png" alt="" width={40} height={40} /></span>
        <span className="brand-copy"><strong>GWAP</strong><small>Grind With A Purpose</small></span>
      </Link>
      <p className="eyebrow">Legal</p>
      <h1>Privacy Policy</h1>
      <p>Last updated: August 2026</p>
      <p>This initial policy describes the public GWAP website. Product-specific privacy terms may apply when visitors use separate ecosystem applications.</p>
      <h2>Information we collect</h2>
      <p>The public website may collect limited technical information such as browser type, device information, approximate location, referral source, and site interactions through hosting and analytics services.</p>
      <h2>How information is used</h2>
      <p>Information may be used to operate, secure, measure, and improve the website, understand general usage trends, and respond to direct communications.</p>
      <h2>External products</h2>
      <p>Links to ecosystem products and social platforms lead to separate services with their own privacy practices. Review those terms before submitting personal or wallet information.</p>
      <h2>Updates</h2>
      <p>This policy will be expanded as accounts, analytics, wallet features, and additional platform services are introduced.</p>
      <p><Link href="/">Return to GWAP</Link></p>
    </main>
  );
}
