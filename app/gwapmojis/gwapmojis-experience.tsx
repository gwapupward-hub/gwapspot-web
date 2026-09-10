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
  gwapMojisStickerUrl,
  type GwapMojisSticker,
} from "../lib/gwapmojis-pack";

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

  const trackSticker = (event: string, sticker: GwapMojisSticker) => {
    const { source, device } = readContext();
    safeTrack(event, { source, device, sticker: sticker.id, sticker_order: sticker.order });
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
                  Open<span className="sr-only"> {sticker.name} at full resolution</span>
                </a>
                <a
                  href={gwapMojisStickerUrl(sticker)}
                  download={sticker.file}
                  data-native-nav
                  onClick={() => trackSticker(GWAPMOJIS_EVENTS.individualDownload, sticker)}
                >
                  Save<span className="sr-only"> {sticker.name}</span>
                </a>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
