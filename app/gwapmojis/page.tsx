import Link from "next/link";
import { PageShell } from "../components/site-shell";
import { GWAPMOJIS_CAMPAIGN } from "../lib/gwapmojis-campaign";
import { resolveGwapMojisTelegramUrl } from "../lib/gwapmojis-analytics";
import { GWAPMOJIS_STICKERS, resolveGwapMojisPackUrl } from "../lib/gwapmojis-pack";
import { createPageMetadata } from "../lib/metadata";
import { GwapMojisExperience } from "./gwapmojis-experience";
import "../gwapmojis-page.css";

export const metadata = createPageMetadata({
  title: "GwapMojis — GwapMode 33",
  description:
    "Download the free GwapMojis GwapMode 33 sticker pack. 33 original GWAP reactions for iPhone, Android, and desktop. No wallet, no account, no payment.",
  path: "/gwapmojis",
  socialTitle: "GwapMojis — GwapMode 33 | GWAP",
});

export default function GwapMojisPage() {
  // Static hosting is the default. An override only exists for deployments that
  // genuinely cannot serve the archive themselves; it never gates the page.
  const packUrl = resolveGwapMojisPackUrl(process.env.NEXT_PUBLIC_GWAPMOJIS_PACK_URL);
  const telegramUrl = resolveGwapMojisTelegramUrl(
    process.env.NEXT_PUBLIC_GWAPMOJIS_TELEGRAM_URL ?? GWAPMOJIS_CAMPAIGN.telegramUrl,
  );

  return (
    <PageShell>
      <div className="gwapmojis-page">
        <GwapMojisExperience packUrl={packUrl} telegramUrl={telegramUrl} />

        <section className="gwapmojis-page-outro" aria-labelledby="gwapmojis-outro-title">
          <h2 id="gwapmojis-outro-title">{GWAPMOJIS_STICKERS.length} GwapMojis. Free. Straight from Tha GwapSpot.</h2>
          <p>
            The pack is a plain download — no wallet, no account, no email, no payment. Keep
            exploring the rest of the ecosystem whenever you are ready.
          </p>
          <div className="gwapmojis-page-outro-links">
            <Link className="secondary-button" href="/ecosystem">
              Explore the ecosystem
            </Link>
            <Link className="secondary-button" href="/app">
              Open GWAP OS
            </Link>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
