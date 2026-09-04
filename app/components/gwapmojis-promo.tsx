"use client";

import { track } from "@vercel/analytics";
import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import {
  GWAPMOJIS_CAMPAIGN,
  getGwapMojisCountdown,
  type GwapMojisCountdown,
} from "../lib/gwapmojis-campaign";

type GwapMojisSurface = "public_home" | "gwapos_home";
type GwapMojisVariant = "feature" | "compact";

type GwapMojisPromoProps = {
  surface?: GwapMojisSurface;
  variant?: GwapMojisVariant;
};

type AnalyticsProperties = Record<string, string | number | boolean>;

function safeTrack(name: string, properties: AnalyticsProperties) {
  try {
    track(name, properties);
  } catch {
    // The campaign must remain usable if analytics is unavailable.
  }
}

function CampaignCountdown({ countdown, compact = false }: { countdown: GwapMojisCountdown | null; compact?: boolean }) {
  if (countdown?.expired) {
    return (
      <div className={`gwapmojis-countdown${compact ? " is-compact" : ""} is-expired`}>
        <span>LIMITED-TIME DOWNLOAD WINDOW</span>
        <strong>DROP ENDED</strong>
      </div>
    );
  }

  const values = countdown
    ? [
        [String(countdown.days).padStart(2, "0"), "DAYS"],
        [String(countdown.hours).padStart(2, "0"), "HRS"],
        [String(countdown.minutes).padStart(2, "0"), "MIN"],
        [String(countdown.seconds).padStart(2, "0"), "SEC"],
      ]
    : [
        ["--", "DAYS"],
        ["--", "HRS"],
        ["--", "MIN"],
        ["--", "SEC"],
      ];

  return (
    <div className={`gwapmojis-countdown${compact ? " is-compact" : ""}`}>
      <span>FREE DOWNLOAD ENDS IN</span>
      <div className="gwapmojis-countdown__digits" aria-hidden="true">
        {values.map(([value, label]) => (
          <div key={label}>
            <strong>{value}</strong>
            <small>{label}</small>
          </div>
        ))}
      </div>
      <span className="sr-only">
        Free GwapMojis download ends {GWAPMOJIS_CAMPAIGN.deadlineLabel}.
      </span>
    </div>
  );
}

export function GwapMojisPromo({
  surface = "public_home",
  variant = "feature",
}: GwapMojisPromoProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const expiredTrackedRef = useRef(false);
  const previewTrackedRef = useRef(false);
  const [countdown, setCountdown] = useState<GwapMojisCountdown | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const isCompact = variant === "compact";
  const titleId = `gwapmojis-title-${surface}`;
  const surfaceClass = surface === "gwapos_home" ? "is-gwapos-home" : "is-public-home";

  useEffect(() => {
    const update = () => setCountdown(getGwapMojisCountdown());
    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!countdown?.expired || expiredTrackedRef.current) return;
    expiredTrackedRef.current = true;
    safeTrack("sticker_campaign_expired", {
      campaign_id: GWAPMOJIS_CAMPAIGN.id,
      surface,
      placement: variant,
    });
  }, [countdown?.expired, surface, variant]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;

    let tracked = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (tracked || !entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.25)) return;
        tracked = true;
        safeTrack("sticker_campaign_impression", {
          campaign_id: GWAPMOJIS_CAMPAIGN.id,
          surface,
          placement: variant,
        });
        observer.disconnect();
      },
      { threshold: [0.25] },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [surface, variant]);

  const trackCta = (asset: string) => {
    safeTrack("sticker_campaign_cta_click", {
      campaign_id: GWAPMOJIS_CAMPAIGN.id,
      surface,
      placement: variant,
      asset,
    });
  };

  const handlePreviewToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const open = event.currentTarget.open;
    setPreviewOpen(open);
    if (!open || previewTrackedRef.current) return;
    previewTrackedRef.current = true;
    safeTrack("sticker_campaign_preview_open", {
      campaign_id: GWAPMOJIS_CAMPAIGN.id,
      surface,
      placement: variant,
    });
  };

  if (isCompact) {
    return (
      <section
        ref={rootRef}
        className={`gwapmojis-promo gwapmojis-promo--compact ${surfaceClass}`}
        aria-labelledby={titleId}
      >
        <div className="gwapmojis-promo__ambient" aria-hidden="true" />
        <div className="gwapmojis-promo__compact-inner">
          <div className="gwapmojis-promo__compact-art" aria-hidden="true">
            <img
              src={GWAPMOJIS_CAMPAIGN.packIconUrl}
              alt=""
              loading={surface === "public_home" ? "eager" : "lazy"}
              decoding="async"
            />
            <span>{GWAPMOJIS_CAMPAIGN.badge}</span>
          </div>

          <div className="gwapmojis-promo__compact-copy">
            <span className="gwapmojis-promo__eyebrow">
              {surface === "gwapos_home" ? "GWAP ECOSYSTEM DROP" : "FREE COMMUNITY DROP"}
            </span>
            <h2 id={titleId}>GwapMojis <em>— GwapMode 33</em></h2>
            <p>33 moods. 4 colors. The official free Telegram reaction pack.</p>
            <CampaignCountdown countdown={countdown} compact />

            <div className="gwapmojis-promo__compact-actions">
              <a
                className="gwapmojis-promo__button is-primary"
                href={GWAPMOJIS_CAMPAIGN.telegramUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => trackCta("telegram")}
              >
                {countdown?.expired ? "View on Telegram" : "Get Free Pack"}
                <span aria-hidden="true">↗</span>
              </a>
              <details className="gwapmojis-promo__preview" onToggle={handlePreviewToggle}>
                <summary>{previewOpen ? "Close preview" : "Preview pack"}</summary>
                <div>
                  <img
                    src={GWAPMOJIS_CAMPAIGN.headerUrl}
                    alt="GwapMojis GwapMode 33 featuring the official orange, green, red, and purple GWAP reaction characters"
                    loading="lazy"
                    decoding="async"
                  />
                  <p>33 static stickers · 33 animated stickers · Core 12 custom emoji</p>
                </div>
              </details>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={rootRef}
      id="gwapmojis"
      className={`gwapmojis-promo gwapmojis-promo--feature ${surfaceClass}`}
      aria-labelledby={titleId}
    >
      <div className="gwapmojis-promo__ambient" aria-hidden="true" />
      <div className="gwapmojis-promo__inner">
        <div className="gwapmojis-promo__visual">
          <img
            className="gwapmojis-promo__header"
            src={GWAPMOJIS_CAMPAIGN.headerUrl}
            alt="GwapMojis GwapMode 33 featuring the official orange, green, red, and purple GWAP reaction characters"
            loading="eager"
            decoding="async"
          />
          <img
            className="gwapmojis-promo__icon"
            src={GWAPMOJIS_CAMPAIGN.packIconUrl}
            alt=""
            loading="lazy"
            decoding="async"
            aria-hidden="true"
          />
          <span className="gwapmojis-promo__drop-badge">{GWAPMOJIS_CAMPAIGN.badge}</span>
        </div>

        <div className="gwapmojis-promo__copy">
          <span className="gwapmojis-promo__eyebrow">FREE COMMUNITY DROP · UNTIL OCT 12</span>
          <h2 id={titleId}>GwapMojis <em>— GwapMode 33</em></h2>
          <p className="gwapmojis-promo__tagline">33 moods. 4 colors. One GWAP character.</p>
          <p className="gwapmojis-promo__body">
            Meet the official GwapMode 33 reaction collection. Grab the free Telegram pack while the drop is open, or download the original sticker and emoji files directly.
          </p>

          <CampaignCountdown countdown={countdown} />

          <div className="gwapmojis-promo__stats" aria-label="GwapMode 33 pack details">
            <span><strong>33</strong> static</span>
            <span><strong>33</strong> animated</span>
            <span><strong>12</strong> custom emoji</span>
            <span><strong>100%</strong> free</span>
          </div>

          <div className="gwapmojis-promo__actions">
            <a
              className="gwapmojis-promo__button is-primary"
              href={GWAPMOJIS_CAMPAIGN.telegramUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => trackCta("telegram")}
            >
              {countdown?.expired ? "View on Telegram" : "Get the Free Pack"}
              <span aria-hidden="true">↗</span>
            </a>
            {!countdown?.expired ? (
              <>
                <a className="gwapmojis-promo__button" href={GWAPMOJIS_CAMPAIGN.completeDownloadUrl} onClick={() => trackCta("complete_zip")}>
                  Complete Pack <span aria-hidden="true">↓</span>
                </a>
                <a className="gwapmojis-promo__button" href={GWAPMOJIS_CAMPAIGN.staticDownloadUrl} onClick={() => trackCta("static_zip")}>
                  Static 33 <span aria-hidden="true">↓</span>
                </a>
                <a className="gwapmojis-promo__button" href={GWAPMOJIS_CAMPAIGN.animatedDownloadUrl} onClick={() => trackCta("animated_zip")}>
                  Animated 33 <span aria-hidden="true">↓</span>
                </a>
                <a className="gwapmojis-promo__button" href={GWAPMOJIS_CAMPAIGN.emojiDownloadUrl} onClick={() => trackCta("emoji_zip")}>
                  Custom Emoji 12 <span aria-hidden="true">↓</span>
                </a>
              </>
            ) : null}
          </div>

          <small className="gwapmojis-promo__note">
            {countdown?.expired
              ? "The limited-time direct download window has ended."
              : `Free to download through ${GWAPMOJIS_CAMPAIGN.deadlineLabel}. No wallet connection or signup required.`}
          </small>
        </div>
      </div>
    </section>
  );
}
