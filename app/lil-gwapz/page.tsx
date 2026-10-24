import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  CaretRight,
  DownloadSimple,
  DeviceMobile,
  ShareNetwork,
} from "@phosphor-icons/react/ssr";
import { pickSticker } from "../lib/lil-gwapz-catalog";
import StickerImage from "./sticker-image";
export const metadata: Metadata = {
  title: "Lil Gwapz — Pick Your Vibe",
  description:
    "76 reactions each. 152 ways to say it. Download original, high-resolution Lil Gwapz transparent stickers, free on any device.",
  alternates: { canonical: "/lil-gwapz" },
  openGraph: {
    title: "Lil Gwapz — Pick Your Vibe",
    url: "https://www.gwapspot.com/lil-gwapz",
    images: [
      {
        url: "/lil-gwapz/brand/logo.png",
        width: 1536,
        height: 1024,
        alt: "Lil Gwapz",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lil Gwapz — Pick Your Vibe",
    images: ["/lil-gwapz/brand/logo.png"],
  },
};
export default function Page() {
  return (
    <main className="lg-home">
      <a className="lg-skip" href="#choose-vibe">
        Skip to character packs
      </a>
      <nav className="lg-home-nav" aria-label="Lil Gwapz navigation">
        <Link href="/">
          <ArrowLeft aria-hidden /> GwapSpot
        </Link>
        <Link href="/lil-gwapz/browse">
          Browse stickers <CaretRight aria-hidden />
        </Link>
      </nav>
      <section className="lg-launch" aria-labelledby="lg-home-title">
        <div className="lg-lockup">
          <Image
            className="lg-logo"
            src="/lil-gwapz/brand/logo.png"
            width={1536}
            height={1024}
            alt="Lil Gwapz"
            priority
          />
          <p className="lg-pack-pill">REACTION PACK 01</p>
          <h1 id="lg-home-title">
            Pick your <span>vibe.</span>
          </h1>
          <p className="lg-tagline">76 reactions each. 152 ways to say it.</p>
        </div>
        <div className="lg-vibe-grid" id="choose-vibe">
          {(["M", "F"] as const).map((sex) => (
            <Link
              key={sex}
              href={"/lil-gwapz/browse?character=" + sex}
              className={"lg-vibe-card " + (sex === "M" ? "male" : "female")}
              aria-label={
                "View " +
                (sex === "M" ? "male" : "female") +
                " pack, 76 reactions"
              }
            >
              <div className="lg-vibe-art">
                <StickerImage
                  sticker={pickSticker(sex === "M" ? 21 : 5, sex)}
                  priority
                  sizes="(max-width: 700px) 68vw, 460px"
                />
              </div>
              <div className="lg-vibe-copy">
                <span className="lg-vibe-name">Lil Gwapz</span>
                <h2>{sex === "M" ? "Male" : "Female"}</h2>
                <span className="lg-pack-link">
                  View pack <CaretRight weight="bold" aria-hidden />
                </span>
              </div>
            </Link>
          ))}
        </div>
        <Link href="/lil-gwapz/browse" className="lg-browse-all">
          Browse all 152 <CaretRight weight="bold" aria-hidden />
        </Link>
        <p className="lg-quality-line">
          Free downloads <span>·</span> Original quality <span>·</span> Any
          device
        </p>
      </section>
      <section
        className="lg-guide"
        id="how-to-use"
        aria-labelledby="lg-guide-title"
      >
        <p className="lg-eyebrow">TAKE YOUR ENERGY EVERYWHERE</p>
        <h2 id="lg-guide-title">Pick it. Save it. Send it.</h2>
        <div className="lg-guide-grid">
          <article>
            <DeviceMobile aria-hidden />
            <h3>Find your reaction</h3>
            <p>Browse all 152 or jump into your favorite character’s pack.</p>
          </article>
          <article>
            <DownloadSimple aria-hidden />
            <h3>Save the original</h3>
            <p>
              Download a crisp, transparent 1254 × 1254 PNG to your phone or
              computer.
            </p>
          </article>
          <article>
            <ShareNetwork aria-hidden />
            <h3>Send your vibe</h3>
            <p>
              Use your device’s Share menu or attach the saved image in your
              favorite app.
            </p>
          </article>
        </div>
        <details className="lg-help">
          <summary>How do I use these on my phone?</summary>
          <p>
            On iPhone, open a sticker and tap Share to save or send it. Download
            saves a PNG to Files. On Android and desktop, look in Downloads. Use
            your messaging app’s image or sticker tools to add it; a PNG
            download doesn’t install a sticker keyboard.
          </p>
        </details>
      </section>
      <footer className="lg-footer">
        <span>Lil Gwapz · An original GWAP collection</span>
        <Link href="/">
          Back to GwapSpot <CaretRight aria-hidden />
        </Link>
      </footer>
    </main>
  );
}
