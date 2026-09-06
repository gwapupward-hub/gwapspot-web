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

export function GwapMojisPromo({ surface = "public_home" }: GwapMojisPromoProps) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const launcherRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const expiredTrackedRef = useRef(false);
  const previewTrackedRef = useRef(false);
  const impressionTrackedRef = useRef(false);
  const [countdown, setCountdown] = useState<GwapMojisCountdown | null>(null);
  const [open, setOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const titleId = `gwapmojis-title-${surface}`;

  useEffect(() => {
    const update = () => setCountdown(getGwapMojisCountdown());
    update();
    setOpen(Boolean(detailsRef.current?.open));
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

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (detailsRef.current) detailsRef.current.open = false;
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

      if (focusable.length === 0) return;
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
    const frame = window.requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }));

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const nextOpen = event.currentTarget.open;
    setOpen(nextOpen);
    if (nextOpen) {
      safeTrack("sticker_campaign_launcher_open", campaignProperties(surface));
    } else {
      setPreviewOpen(false);
      safeTrack("sticker_campaign_dismissed", campaignProperties(surface));
    }
  };

  const closeCampaign = () => {
    if (detailsRef.current) detailsRef.current.open = false;
    setPreviewOpen(false);
    launcherRef.current?.focus({ preventScroll: true });
  };

  const trackCta = (asset: string) => {
    safeTrack("sticker_campaign_cta_click", {
      ...campaignProperties(surface),
      asset,
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
    <details
      ref={detailsRef}
      className={`gwapmojis-float is-${surface}`}
      onToggle={handleToggle}
      style={{ width: 68, height: 68, display: "block", overflow: "visible" }}
    >
      <style>{`
        details.gwapmojis-float { width: 68px !important; height: 68px !important; display: block !important; overflow: visible !important; }
        details.gwapmojis-float > summary.gwapmojis-launcher {
          display: block !important;
          width: 68px !important;
          height: 68px !important;
          box-sizing: border-box !important;
          list-style: none !important;
          -webkit-appearance: none !important;
          appearance: none !important;
          visibility: visible !important;
          opacity: 1 !important;
        }
        details.gwapmojis-float > summary.gwapmojis-launcher::-webkit-details-marker { display: none !important; }
        details.gwapmojis-float > summary.gwapmojis-launcher::marker { content: ""; display: none; }
        .gwapmojis-float:not([open]) > .gwapmojis-overlay { display: none; }
        @media (max-width: 760px) {
          details.gwapmojis-float { width: 58px !important; height: 58px !important; }
          details.gwapmojis-float > summary.gwapmojis-launcher { width: 58px !important; height: 58px !important; }
          .gwapmojis-overlay { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; background: rgba(0,0,0,.48); }
          .gwapmojis-sheet { box-shadow: 0 -18px 42px rgba(0,0,0,.42) !important; }
        }
      `}</style>

      <summary
        ref={launcherRef}
        className="gwapmojis-launcher"
        aria-label="Open free GwapMojis GwapMode 33 sticker pack"
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
      </summary>

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
          </div>

          <div className="gwapmojis-sheet__hero">
            <img
              src={GWAPMOJIS_CAMPAIGN.packIconUrl}
              alt="GwapMojis GwapMode 33 sticker pack icon"
              width="92"
              height="92"
              loading="eager"
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
              : `Free through ${GWAPMOJIS_CAMPAIGN.deadlineLabel}. No wallet connection or signup required.`}
          </small>
        </div>
      </div>
    </details>
  );
}
