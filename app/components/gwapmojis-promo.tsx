import Image from "next/image";
import Link from "next/link";

const PACK_ICON_URL = "https://res.cloudinary.com/dg1u1wpdu/image/upload/v1788521171/gwapmojis/gwapmode33/pack-icon.png";
const HEADER_URL = "https://res.cloudinary.com/dg1u1wpdu/image/upload/v1788521177/gwapmojis/gwapmode33/header.png";
const DOWNLOAD_URL = "https://res.cloudinary.com/dg1u1wpdu/raw/upload/v1788521185/gwapmojis/gwapmode33/GwapMojis_GwapMode33_Telegram_Static_33.zip";

export function GwapMojisPromo() {
  const telegramUrl = process.env.NEXT_PUBLIC_GWAPMOJIS_TELEGRAM_URL;

  return (
    <>
      <section id="gwapmojis" className="gwapmojis-promo" aria-labelledby="gwapmojis-title">
        <div className="gwapmojis-promo__ambient" aria-hidden="true" />
        <div className="gwapmojis-promo__inner">
          <div className="gwapmojis-promo__visual">
            <img
              className="gwapmojis-promo__header"
              src={HEADER_URL}
              alt="GwapMojis GwapMode 33 featuring the official orange, green, red, and purple GWAP reaction characters"
              loading="lazy"
              decoding="async"
            />
            <img
              className="gwapmojis-promo__icon"
              src={PACK_ICON_URL}
              alt=""
              loading="lazy"
              decoding="async"
              aria-hidden="true"
            />
          </div>

          <div className="gwapmojis-promo__copy">
            <span className="gwapmojis-promo__eyebrow">FREE COMMUNITY DROP</span>
            <h2 id="gwapmojis-title">GwapMojis <em>— GwapMode 33</em></h2>
            <p className="gwapmojis-promo__tagline">33 moods. 4 colors. One GWAP character.</p>
            <p className="gwapmojis-promo__body">
              Download the official GwapMode 33 reaction collection free. The pack uses the exact approved master artwork and includes all 33 Telegram-ready static reactions.
            </p>

            <div className="gwapmojis-promo__stats" aria-label="GwapMode 33 pack details">
              <span><strong>33</strong> static reactions</span>
              <span><strong>4</strong> color modes</span>
              <span><strong>100%</strong> free</span>
            </div>

            <div className="gwapmojis-promo__actions">
              <a className="gwapmojis-promo__button is-primary" href={DOWNLOAD_URL}>
                Download free pack
                <span aria-hidden="true">↓</span>
              </a>
              {telegramUrl ? (
                <a className="gwapmojis-promo__button" href={telegramUrl} target="_blank" rel="noreferrer">
                  Add on Telegram
                  <span aria-hidden="true">↗</span>
                </a>
              ) : null}
            </div>

            <small className="gwapmojis-promo__note">Free to download. No wallet connection or signup required.</small>
          </div>
        </div>
      </section>

      <footer className="cinematic-footer gwapmojis-site-footer">
        <div className="footer-lockup">
          <Image src="/logos/gwap-agent-clear.svg" alt="" width={42} height={42} />
          <span><strong>GWAP</strong><small>GRIND WITH A PURPOSE</small></span>
        </div>
        <div className="footer-nav">
          <Link href="/ecosystem">Ecosystem</Link>
          <Link href="/about">About</Link>
          <Link href="/roadmap">Roadmap</Link>
          <Link href="/changelog">Build Log</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </div>
        <small>© {new Date().getFullYear()} GWAP. The future rewards purpose.</small>
      </footer>
    </>
  );
}
