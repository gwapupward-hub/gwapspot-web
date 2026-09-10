"use client";

import { track } from "@vercel/analytics";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  GWAPMOJIS_EVENTS,
  gwapMojisDownloadInstructions,
  resolveGwapMojisDeviceType,
  resolveGwapMojisSource,
  type GwapMojisDeviceType,
  type GwapMojisDownloadInstructions,
  type GwapMojisSource,
} from "../lib/gwapmojis-analytics";
import {
  GWAPMOJIS_PACK_FILENAME,
  GWAPMOJIS_STICKERS,
  gwapMojisStickerAlt,
  gwapMojisStickerShareUrl,
  gwapMojisStickerUrl,
  type GwapMojisSticker,
} from "../lib/gwapmojis-pack";
import {
  GWAPMOJIS_GUIDES,
  gwapMojisGuideDomId,
  gwapMojisHowToCtaLabel,
  gwapMojisLeadPlatform,
  orderGwapMojisGuides,
  type GwapMojisGuide,
  type GwapMojisPlatform,
} from "../lib/gwapmojis-howto";

type AnalyticsProperties = Record<string, string | number | boolean>;

type GwapMojisExperienceProps = {
  packUrl: string;
  telegramUrl: string | null;
};

type DownloadPhase = "idle" | "started" | "failed";
type VisitContext = { source: GwapMojisSource; device: GwapMojisDeviceType };

function safeTrack(name: string, properties: AnalyticsProperties) {
  try {
    track(name, properties);
  } catch {
    // Campaign analytics must never interfere with the download experience.
  }
}

// The first eight tiles cover the initial viewport on every supported width.
const EAGER_STICKER_COUNT = 8;

export function GwapMojisExperience({ packUrl, telegramUrl }: GwapMojisExperienceProps) {
  const [phase, setPhase] = useState<DownloadPhase>("idle");
  const [instructions, setInstructions] = useState<GwapMojisDownloadInstructions | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  // Device-derived presentation, resolved once on mount. Kept in state (not
  // read from a ref during render) so the server and first client render match.
  const [presentation, setPresentation] = useState<{
    device: GwapMojisDeviceType;
    guides: readonly GwapMojisGuide[];
  }>({ device: "desktop", guides: GWAPMOJIS_GUIDES });
  const { device: presentedDevice, guides } = presentation;
  const [openGuide, setOpenGuide] = useState<GwapMojisPlatform | null>(null);
  // Marks the guide the download-success shortcut jumped to. Programmatic focus
  // does not trigger :focus-visible, so without this the visitor gets no
  // indication of where they landed.
  const [jumpedGuide, setJumpedGuide] = useState<GwapMojisPlatform | null>(null);
  const howToRef = useRef<HTMLElement | null>(null);
  const guideRefs = useRef(new Map<GwapMojisPlatform, HTMLButtonElement | null>());
  const contextRef = useRef<VisitContext | null>(null);
  const downloadCountRef = useRef(0);
  const viewTrackedRef = useRef(false);
  const probeRef = useRef<AbortController | null>(null);
  const confirmationRef = useRef<HTMLDivElement | null>(null);

  /** Attribution and device bucket, read from the browser once per visit. */
  const readContext = useCallback((): VisitContext => {
    if (contextRef.current) return contextRef.current;

    let referrerPath: string | null = null;
    try {
      const referrer = document.referrer ? new URL(document.referrer) : null;
      if (referrer && referrer.origin === window.location.origin) referrerPath = referrer.pathname;
    } catch {
      // An unreadable referrer simply means the visit counts as direct.
    }

    const params = new URLSearchParams(window.location.search);
    const context: VisitContext = {
      source: resolveGwapMojisSource(params.get("source"), referrerPath),
      device: resolveGwapMojisDeviceType(window.navigator.userAgent),
    };
    contextRef.current = context;
    return context;
  }, []);

  useEffect(() => {
    if (viewTrackedRef.current) return;
    viewTrackedRef.current = true;
    const { source, device } = readContext();
    safeTrack(GWAPMOJIS_EVENTS.viewed, { source, device });
    // Presentation only: the detected device reorders the guides, it never
    // gates them. All three render on every device, in every order.
    setPresentation({ device, guides: orderGwapMojisGuides(device) });
  }, [readContext]);

  useEffect(() => () => probeRef.current?.abort(), []);

  /**
   * Confirm the archive really is being served. This runs *after* the browser
   * has already been handed the native download, so it can never delay or
   * cancel it — it only decides whether to surface the recovery panel.
   */
  const probePack = useCallback(() => {
    probeRef.current?.abort();
    const controller = new AbortController();
    probeRef.current = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 10_000);

    const probe = (() => {
      try {
        return fetch(packUrl, { method: "HEAD", cache: "no-store", signal: controller.signal });
      } catch (error) {
        // A browser or extension that breaks fetch outright is still a failure
        // to verify, never an exception escaping the click handler.
        return Promise.reject(error);
      }
    })();

    void probe
      .then((response) => {
        if (probeRef.current !== controller) return;
        const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
        // A rewritten .zip request returns the application shell as HTML.
        if (!response.ok || contentType.startsWith("text/html")) setPhase("failed");
      })
      .catch(() => {
        // A superseded or unmounted probe is not a download failure.
        if (probeRef.current !== controller) return;
        if (controller.signal.aborted && !timedOut) return;
        setPhase("failed");
      })
      .finally(() => window.clearTimeout(timeout));
  }, [packUrl]);

  /**
   * Existing Redis-backed campaign counter. A beacon keeps it entirely out of
   * the download path: it never blocks, never retries, and never surfaces an
   * error when the counter is not configured. Vercel Analytics still records
   * the action either way.
   */
  const recordClaim = (asset: "static_zip" | "telegram") => {
    try {
      navigator.sendBeacon?.(
        "/api/gwapmojis/claims",
        new Blob([JSON.stringify({ asset })], { type: "application/json" }),
      );
    } catch {
      // The claim counter is supplemental and must never affect the download.
    }
  };

  const handlePackDownload = () => {
    // Never cancel this event. The anchor performs the real download and must
    // keep working on the first tap even if everything below fails.
    const { source, device } = readContext();
    downloadCountRef.current += 1;
    const attempt = downloadCountRef.current;

    setInstructions(gwapMojisDownloadInstructions(device));
    setPhase("started");
    safeTrack(
      attempt === 1 ? GWAPMOJIS_EVENTS.packDownloadStarted : GWAPMOJIS_EVENTS.packDownloadRetry,
      { source, device, attempt, file: GWAPMOJIS_PACK_FILENAME },
    );
    recordClaim("static_zip");
    probePack();
  };

  useEffect(() => {
    if (phase === "idle") return;
    confirmationRef.current?.focus({ preventScroll: true });
  }, [phase]);

  const trackSticker = (event: string, sticker: GwapMojisSticker, extra: AnalyticsProperties = {}) => {
    const { source, device } = readContext();
    safeTrack(event, { source, device, sticker: sticker.id, sticker_order: sticker.order, ...extra });
  };

  /** Accordion: one guide open at a time, and never gated by device. */
  const toggleGuide = (platform: GwapMojisPlatform) => {
    setJumpedGuide(null);
    setOpenGuide((current) => {
      if (current === platform) return null;
      const { source, device } = readContext();
      safeTrack(GWAPMOJIS_EVENTS.howToOpened, { source, device, platform });
      return platform;
    });
  };

  /**
   * The download-success shortcut. Opens the guide that matches the device and
   * moves focus to its control, so keyboard and screen-reader users land in the
   * same place a scroll would put everyone else.
   */
  const jumpToGuide = (platform: GwapMojisPlatform) => {
    setOpenGuide(platform);
    setJumpedGuide(platform);
    const { source, device } = readContext();
    safeTrack(GWAPMOJIS_EVENTS.howToOpened, { source, device, platform, via: "download_success" });
    window.requestAnimationFrame(() => {
      howToRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      guideRefs.current.get(platform)?.focus({ preventScroll: true });
    });
  };

  return (
    <>
      <section className="gwapmojis-page-hero" aria-labelledby="gwapmojis-hero-title">
        <p className="gwapmojis-page-eyebrow">GWAPMOJIS</p>
        <h1 id="gwapmojis-hero-title">
          <span>GWAPMOJIS</span>
          <em>GWAPMODE 33</em>
        </h1>
        <p className="gwapmojis-page-tagline">YOUR REACTIONS NEED AN UPGRADE.</p>

        <div className="gwapmojis-page-cta">
          <a
            className="gwapmojis-page-download"
            href={packUrl}
            download={GWAPMOJIS_PACK_FILENAME}
            data-native-nav
            onClick={handlePackDownload}
          >
            DOWNLOAD FREE PACK
          </a>
          {telegramUrl ? (
            <a
              className="gwapmojis-page-secondary"
              href={telegramUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                const { source, device } = readContext();
                safeTrack(GWAPMOJIS_EVENTS.telegramClicked, { source, device });
                recordClaim("telegram");
              }}
            >
              ADD TO TELEGRAM
            </a>
          ) : null}
        </div>
        {telegramUrl ? (
          <p className="gwapmojis-page-telegram-note">
            Official GwapMode 33 pack on Telegram · Telegram Premium. The download above is free
            either way — no account, no wallet, no payment.
          </p>
        ) : null}

        <ul className="gwapmojis-page-facts">
          <li>33 original GWAP reactions.</li>
          <li>Free.</li>
          <li>No wallet required.</li>
        </ul>
        <p className="gwapmojis-page-platforms">Works on iPhone • Android • Desktop</p>

        {phase !== "idle" ? (
          <div
            className={`gwapmojis-page-confirm${phase === "failed" ? " is-failed" : ""}`}
            ref={confirmationRef}
            tabIndex={-1}
            role="status"
            aria-live="polite"
          >
            {phase === "started" && instructions ? (
              <>
                <strong>{instructions.title}</strong>
                <p>{instructions.status}</p>
                <p>{instructions.where}</p>
              </>
            ) : (
              <>
                <strong>That download did not come through.</strong>
                <p>
                  The pack file did not respond. Try again, or open the file directly and save it
                  from your browser.
                </p>
              </>
            )}

            <div className="gwapmojis-page-confirm-primary">
              <button
                className="gwapmojis-page-howto-cta"
                type="button"
                onClick={() => jumpToGuide(gwapMojisLeadPlatform(presentedDevice))}
              >
                {gwapMojisHowToCtaLabel(presentedDevice)}
              </button>
              {telegramUrl ? (
                <a
                  className="gwapmojis-page-telegram-shortcut"
                  href={telegramUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    const { source, device } = readContext();
                    safeTrack(GWAPMOJIS_EVENTS.telegramClicked, {
                      source,
                      device,
                      placement: "download_success",
                    });
                    recordClaim("telegram");
                  }}
                >
                  ADD FULL PACK TO TELEGRAM
                </a>
              ) : null}
            </div>

            <div className="gwapmojis-page-confirm-actions">
              <a
                className="gwapmojis-page-retry"
                href={packUrl}
                download={GWAPMOJIS_PACK_FILENAME}
                data-native-nav
                onClick={handlePackDownload}
              >
                Download Again
              </a>
              <a className="gwapmojis-page-plain" href={packUrl} data-native-nav>
                Open the file directly
              </a>
              <a className="gwapmojis-page-plain" href="#gwapmojis-gallery">
                Back to the sticker gallery
              </a>
              <button
                className="gwapmojis-page-plain"
                type="button"
                aria-expanded={helpOpen}
                aria-controls="gwapmojis-help"
                onClick={() => setHelpOpen((open) => !open)}
              >
                {helpOpen ? "Hide how to use" : "How to use"}
              </button>
            </div>

            <div id="gwapmojis-help" hidden={!helpOpen}>
              <ul className="gwapmojis-page-help">
                <li>
                  <strong>iPhone:</strong> Safari saves the pack to Files → Downloads. Tap the ZIP
                  once to unzip it, then add the stickers wherever you react.
                </li>
                <li>
                  <strong>Android:</strong> Chrome saves the pack to Downloads. Open it with your
                  files app to extract the 33 WEBP stickers.
                </li>
                <li>
                  <strong>Desktop:</strong> Unzip the archive and drag the stickers into your chat
                  app of choice.
                </li>
              </ul>
            </div>
          </div>
        ) : null}
      </section>

      <section
        className="gwapmojis-page-howto"
        id="gwapmojis-howto"
        ref={howToRef}
        aria-labelledby="gwapmojis-howto-title"
      >
        <h2 id="gwapmojis-howto-title">HOW TO USE GWAPMOJIS</h2>
        <p className="gwapmojis-page-howto-lead">
          YOUR REACTIONS ARE READY. NOW PUT &rsquo;EM TO WORK.
        </p>

        <div className="gwapmojis-page-accordion">
          {guides.map((guide) => {
            const open = openGuide === guide.id;
            const panelId = `${gwapMojisGuideDomId(guide.id)}-panel`;
            return (
              <div className="gwapmojis-page-guide" key={guide.id} id={gwapMojisGuideDomId(guide.id)}>
                <h3>
                  <button
                    type="button"
                    className="gwapmojis-page-guide-toggle"
                    aria-expanded={open}
                    aria-controls={panelId}
                    ref={(node) => {
                      guideRefs.current.set(guide.id, node);
                    }}
                    data-jumped={jumpedGuide === guide.id ? "true" : undefined}
                    onBlur={() => setJumpedGuide((current) => (current === guide.id ? null : current))}
                    onClick={() => toggleGuide(guide.id)}
                  >
                    <span className="gwapmojis-page-guide-label">{guide.label}</span>
                    <span className="gwapmojis-page-guide-mark" aria-hidden="true">
                      {open ? "−" : "+"}
                    </span>
                  </button>
                </h3>

                <div className="gwapmojis-page-guide-panel" id={panelId} hidden={!open}>
                  <p className="gwapmojis-page-guide-headline">{guide.headline}</p>
                  <p className="gwapmojis-page-guide-summary">{guide.summary}</p>

                  {guide.cta ? (
                    <a
                      className="gwapmojis-page-guide-cta"
                      href={guide.cta.href}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => {
                        const { source, device } = readContext();
                        safeTrack(GWAPMOJIS_EVENTS.telegramClicked, {
                          source,
                          device,
                          placement: "howto_guide",
                        });
                        recordClaim("telegram");
                      }}
                    >
                      {guide.cta.label}
                    </a>
                  ) : null}
                  {guide.cta ? (
                    <p className="gwapmojis-page-guide-cta-note">{guide.cta.note}</p>
                  ) : null}

                  {guide.sections.map((section) => (
                    <div className="gwapmojis-page-guide-section" key={section.heading}>
                      <h4>{section.heading}</h4>
                      {/* A lone statement is prose, not a one-item numbered list. */}
                      {section.steps.length === 1 ? (
                        <p className="gwapmojis-page-guide-line">{section.steps[0]}</p>
                      ) : (
                        <ol>
                          {section.steps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      )}
                      {section.note ? <p className="gwapmojis-page-guide-note">{section.note}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section
        className="gwapmojis-page-gallery"
        id="gwapmojis-gallery"
        aria-labelledby="gwapmojis-gallery-title"
      >
        <h2 id="gwapmojis-gallery-title">BROWSE GWAPMOJIS</h2>
        <p className="gwapmojis-page-gallery-note">
          All 33 reactions from the GwapMode 33 pack. Open one to save it on its own, or take the
          whole pack above.
        </p>

        <ul className="gwapmojis-page-grid">
          {GWAPMOJIS_STICKERS.map((sticker, index) => (
            <li key={sticker.id} className="gwapmojis-page-tile">
              <Image
                src={gwapMojisStickerUrl(sticker)}
                alt={gwapMojisStickerAlt(sticker)}
                width={sticker.width}
                height={sticker.height}
                sizes="(max-width: 480px) 40vw, (max-width: 900px) 25vw, 180px"
                loading={index < EAGER_STICKER_COUNT ? "eager" : "lazy"}
                priority={false}
              />
              <p className="gwapmojis-page-tile-name">
                <span aria-hidden="true">{sticker.emoji}</span> {sticker.name}
              </p>
              <div className="gwapmojis-page-tile-actions">
                <a
                  href={gwapMojisStickerUrl(sticker)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => trackSticker(GWAPMOJIS_EVENTS.stickerOpened, sticker)}
                >
                  View<span className="sr-only"> {sticker.name} at full resolution</span>
                </a>
                {/* Saves the PNG copy: Photos and gallery apps accept PNG, WebP not always. */}
                <a
                  href={gwapMojisStickerShareUrl(sticker)}
                  download={sticker.shareFile}
                  data-native-nav
                  onClick={() =>
                    trackSticker(GWAPMOJIS_EVENTS.stickerSaveStarted, sticker, { format: "png" })
                  }
                >
                  Save<span className="sr-only"> sticker: {sticker.name}, as a PNG</span>
                </a>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
