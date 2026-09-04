import Image from "next/image";
import Link from "next/link";

const PACK_ICON_URL = "https://res.cloudinary.com/dg1u1wpdu/image/upload/v1788521171/gwapmojis/gwapmode33/pack-icon.png";
const HEADER_URL = "https://res.cloudinary.com/dg1u1wpdu/image/upload/v1788521177/gwapmojis/gwapmode33/header.png";
const COMPLETE_DOWNLOAD_URL = "https://res.cloudinary.com/dg1u1wpdu/raw/upload/v1788522411/gwapmojis/gwapmode33/GwapMojis_GwapMode33_Complete_Telegram_Pack.zip";
const STATIC_DOWNLOAD_URL = "https://res.cloudinary.com/dg1u1wpdu/raw/upload/v1788521185/gwapmojis/gwapmode33/GwapMojis_GwapMode33_Telegram_Static_33.zip";
const ANIMATED_DOWNLOAD_URL = "https://res.cloudinary.com/dg1u1wpdu/raw/upload/v1788522251/gwapmojis/gwapmode33/GwapMojis_GwapMode33_Animated_Full33_WEBM.zip";
const EMOJI_DOWNLOAD_URL = "https://res.cloudinary.com/dg1u1wpdu/raw/upload/v1788522264/gwapmojis/gwapmode33/GwapMojis_GwapMode33_Core12_Custom_Emoji.zip";
const TELEGRAM_STICKER_PACK_URL = "https://t.me/addstickers/GwapMode33";

export function GwapMojisPromo() {
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
              Download the official GwapMode 33 reaction collection free. Every asset derives from the exact approved master artwork: 33 static stickers, 33 Telegram video stickers, and a Core 12 custom emoji set.
            </p>

            <div className="gwapmojis-promo__stats" aria-label="GwapMode 33 pack details">
              <span><strong>33</strong> static</span>
              <span><strong>33</strong> animated</span>
              <span><strong>12</strong> custom emoji</span>
              <span><strong>100%</strong> free</span>
            </div>

            <div className="gwapmojis-promo__actions">
              <a className="gwapmojis-promo__button is-primary" href={TELEGRAM_STICKER_PACK_URL} target="_blank" rel="noreferrer">
                Add on Telegram
                <span aria-hidden="true">↗</span>
              </a>
              <a className="gwapmojis-promo__button" href={COMPLETE_DOWNLOAD_URL}>
                Complete Pack
                <span aria-hidden="true">↓</span>
              </a>
              <a className="gwapmojis-promo__button" href={STATIC_DOWNLOAD_URL}>
                Static 33
                <span aria-hidden="true">↓</span>
              </a>
              <a className="gwapmojis-promo__button" href={ANIMATED_DOWNLOAD_URL}>
                Animated 33
                <span aria-hidden="true">↓</span>
              </a>
              <a className="gwapmojis-promo__button" href={EMOJI_DOWNLOAD_URL}>
                Custom Emoji 12
                <span aria-hidden="true">↓</span>
              </a>
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
