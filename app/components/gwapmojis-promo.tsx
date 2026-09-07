"use client";

import { track } from "@vercel/analytics";
import { useEffect, useRef, useState } from "react";
import {
  GWAPMOJIS_CAMPAIGN,
  getGwapMojisCountdown,
  type GwapMojisCountdown,
} from "../lib/gwapmojis-campaign";

type GwapMojisSurface = "public_home" | "gwapos_home";
type GwapMojisVariant = "feature" | "compact";
type ClaimAsset = "telegram" | "complete_zip" | "static_zip" | "animated_zip" | "emoji_zip";

type GwapMojisPromoProps = {
  surface?: GwapMojisSurface;
  variant?: GwapMojisVariant;
};

type AnalyticsProperties = Record<string, string | number | boolean>;
type ClaimCountResponse = {
  available?: boolean;
  total?: number;
};

function safeTrack(name: string, properties: AnalyticsProperties) {
  try {
    track(name, properties);
  } catch {
    // Campaign analytics must never interfere with the product experience.
  }
}

function campaignProperties(surface: GwapMojisSurface) {
  return {
    campaign_id: GWAPMOJIS_CAMPAIGN.id,
    surface,
    placement: "floating_launcher",
  } as const;
}

function CampaignCountdown({ countdown }: { countdown: GwapMojisCountdown | null }) {
  if (countdown?.expired) {
    return (
      <div className="gwapmojis-countdown is-expired">
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
    <div className="gwapmojis-countdown">
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
}: GwapMojisPromoProps) {
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const expiredTrackedRef = useRef(false);
  const previewTrackedRef = useRef(false);
  const impressionTrackedRef = useRef(false);
  const [countdown, setCountdown] = useState<GwapMojisCountdown | null>(null);
  const [open, setOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [claimCount, setClaimCount] = useState<number | null>(null);
  const titleId = `gwapmojis-title-${surface}`;

  useEffect(() => {
    const update = () => setCountdown(getGwapMojisCountdown());
    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (impressionTrackedRef.current) return;
    impressionTrackedRef.current = true;
    safeTrack("sticker_campaign_impression", campaignProperties(surface));
  }, [surface]);

  useEffect(() => {
    if (!countdown?.expired || expiredTrackedRef.current) return;
    expiredTrackedRef.current = true;
    safeTrack("sticker_campaign_expired", campaignProperties(surface));
  }, [countdown?.expired, surface]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const refreshClaims = async () => {
      try {
        const response = await fetch("/api/gwapmojis/claims", {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return;
        const payload = (await response.json()) as ClaimCountResponse;
        if (!cancelled && payload.available && typeof payload.total === "number") {
          setClaimCount(payload.total);
        }
      } catch {
        // Claim count is supplemental and must never block the campaign UI.
      }
    };

    void refreshClaims();
    const interval = window.setInterval(refreshClaims, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setPreviewOpen(false);
        return;
      }

      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getAttribute("aria-hidden") !== "true");

      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    const frame = window.requestAnimationFrame(() => panelRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      launcherRef.current?.focus();
    };
  }, [open]);

  const openCampaign = () => {
    setOpen(true);
    safeTrack("sticker_campaign_launcher_open", campaignProperties(surface));
  };

  const closeCampaign = () => {
    setOpen(false);
    setPreviewOpen(false);
    safeTrack("sticker_campaign_dismissed", campaignProperties(surface));
  };

  const trackCta = (asset: ClaimAsset) => {
    safeTrack("sticker_campaign_cta_click", {
      ...campaignProperties(surface),
      asset,
    });

    setClaimCount((current) => (current === null ? current : current + 1));
    void fetch("/api/gwapmojis/claims", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset }),
    })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as ClaimCountResponse;
        if (payload.available && typeof payload.total === "number") {
          setClaimCount(payload.total);
        }
      })
      .catch(() => {
        // Vercel analytics still records the CTA even if the durable counter is unavailable.
      });
  };

  const togglePreview = () => {
    setPreviewOpen((current) => {
      const next = !current;
      if (next && !previewTrackedRef.current) {
        previewTrackedRef.current = true;
        safeTrack("sticker_campaign_preview_open", campaignProperties(surface));
      }
      return next;
    });
  };

  return (
    <div className={`gwapmojis-float is-${surface}`}>
      <button
        ref={launcherRef}
        className="gwapmojis-launcher"
        type="button"
        aria-label="Open free GwapMojis GwapMode 33 sticker pack"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openCampaign}
      >
        <img
          src={GWAPMOJIS_CAMPAIGN.packIconUrl}
          alt=""
          width="72"
          height="72"
          loading={surface === "public_home" ? "eager" : "lazy"}
          decoding="async"
        />
        <span className="gwapmojis-launcher__badge">FREE</span>
        <span className="gwapmojis-launcher__hint">GwapMojis</span>
      </button>

      {open ? (
        <div
          className="gwapmojis-overlay"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) closeCampaign();
          }}
        >
          <div
            ref={panelRef}
            className="gwapmojis-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
          >
            <button
              className="gwapmojis-sheet__close"
              type="button"
              aria-label="Close GwapMojis promotion"
              onClick={closeCampaign}
            >
              ×
            </button>

            <div className="gwapmojis-sheet__topline">
              <span>GWAP ECOSYSTEM DROP</span>
              <b>{countdown?.expired ? "ARCHIVE" : "FREE UNTIL OCT 12"}</b>
              <span aria-live="polite">
                {claimCount === null ? "LIVE CLAIM COUNT" : `${claimCount.toLocaleString()} PACK CLAIMS`}
              </span>
            </div>

            <div className="gwapmojis-sheet__hero">
              <img
                src={GWAPMOJIS_CAMPAIGN.packIconUrl}
                alt="GwapMojis GwapMode 33 sticker pack icon"
                width="92"
                height="92"
                loading="lazy"
                decoding="async"
              />
              <div>
                <h2 id={titleId}>GwapMojis <em>— GwapMode 33</em></h2>
                <p>33 moods. 4 colors. The official free Telegram reaction pack.</p>
              </div>
            </div>

            <CampaignCountdown countdown={countdown} />

            <div className="gwapmojis-sheet__actions">
              <a
                className="gwapmojis-action is-primary"
                href={GWAPMOJIS_CAMPAIGN.telegramUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => trackCta("telegram")}
              >
                {countdown?.expired ? "View on Telegram" : "Get Free Pack"}
                <span aria-hidden="true">↗</span>
              </a>
              <button className="gwapmojis-action" type="button" onClick={togglePreview}>
                {previewOpen ? "Hide Preview" : "Preview Pack"}
              </button>
            </div>

            {previewOpen ? (
              <div className="gwapmojis-sheet__preview">
                <img
                  src={GWAPMOJIS_CAMPAIGN.headerUrl}
                  alt="GwapMojis GwapMode 33 featuring the official orange, green, red, and purple GWAP reaction characters"
                  loading="lazy"
                  decoding="async"
                />
                <p>33 static stickers · 33 animated stickers · Core 12 custom emoji</p>
              </div>
            ) : null}

            {!countdown?.expired ? (
              <div className="gwapmojis-sheet__downloads" aria-label="Direct GwapMojis downloads">
                <span>DIRECT DOWNLOADS</span>
                <div>
                  <a href={GWAPMOJIS_CAMPAIGN.completeDownloadUrl} onClick={() => trackCta("complete_zip")}>Complete</a>
                  <a href={GWAPMOJIS_CAMPAIGN.staticDownloadUrl} onClick={() => trackCta("static_zip")}>Static 33</a>
                  <a href={GWAPMOJIS_CAMPAIGN.animatedDownloadUrl} onClick={() => trackCta("animated_zip")}>Animated 33</a>
                  <a href={GWAPMOJIS_CAMPAIGN.emojiDownloadUrl} onClick={() => trackCta("emoji_zip")}>Emoji 12</a>
                </div>
              </div>
            ) : null}

            <small className="gwapmojis-sheet__note">
              {countdown?.expired
                ? "The limited-time direct download window has ended."
                : `Free through ${GWAPMOJIS_CAMPAIGN.deadlineLabel}. Pack claims count CTA/download actions; Telegram does not expose confirmed install events.`}
            </small>
          </div>
        </div>
      ) : null}
    </div>
  );
}
