"use client";

import { track } from "@vercel/analytics";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { GWAPMOJIS_STICKERS, gwapMojisStickerUrl } from "../lib/gwapmojis-pack";

type GwapMojisSurface = "public_home" | "gwapos_home";
type GwapMojisVariant = "feature" | "compact";

type GwapMojisPromoProps = {
  surface?: GwapMojisSurface;
  variant?: GwapMojisVariant;
};

type AnalyticsProperties = Record<string, string | number | boolean>;

const SURFACE_SOURCES = {
  public_home: "homepage",
  gwapos_home: "gwapos",
} as const;

// The pack's own approved artwork doubles as the promo tile.
const PROMO_STICKER = GWAPMOJIS_STICKERS.find((sticker) => sticker.id === "02_money_eyes")
  ?? GWAPMOJIS_STICKERS[0];

function safeTrack(name: string, properties: AnalyticsProperties) {
  try {
    track(name, properties);
  } catch {
    // Campaign analytics must never interfere with the product experience.
  }
}

/**
 * Homepage and GwapOS both render this module, and both send visitors to the
 * one canonical `/gwapmojis` destination. It is a plain link on purpose: the
 * first tap navigates natively, with no overlay, portal or pointer handler
 * standing between the visitor and the campaign page.
 */
export function GwapMojisPromo({ surface = "public_home" }: GwapMojisPromoProps) {
  const impressionTrackedRef = useRef(false);
  const source = SURFACE_SOURCES[surface];

  useEffect(() => {
    if (impressionTrackedRef.current) return;
    impressionTrackedRef.current = true;
    safeTrack("sticker_campaign_impression", {
      campaign_id: "gwapmojis-gwapmode-33",
      surface,
      placement: "floating_launcher",
    });
  }, [surface]);

  return (
    <div className={`gwapmojis-float is-${surface}`}>
      <Link
        className="gwapmojis-launcher"
        href={`/gwapmojis?source=${source}`}
        prefetch={false}
        data-native-nav
        aria-label="GwapMojis GwapMode 33 — download the free sticker pack"
        onClick={() =>
          safeTrack("sticker_campaign_launcher_open", {
            campaign_id: "gwapmojis-gwapmode-33",
            surface,
            placement: "floating_launcher",
          })
        }
      >
        <Image
          src={gwapMojisStickerUrl(PROMO_STICKER)}
          alt=""
          width={72}
          height={72}
          loading={surface === "public_home" ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
        />
        <span className="gwapmojis-launcher__badge">FREE</span>
        <span className="gwapmojis-launcher__hint">GwapMojis</span>
      </Link>
    </div>
  );
}
