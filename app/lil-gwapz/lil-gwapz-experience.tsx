"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  MagnifyingGlass,
  DownloadSimple,
  ShareNetwork,
  X,
  ArrowSquareOut,
  ArrowsOutSimple,
  ArrowClockwise,
} from "@phosphor-icons/react/ssr";
import {
  characterName,
  filterStickers,
  originalUrl,
  type CharacterFilter,
  type Sticker,
} from "../lib/lil-gwapz-catalog";
import StickerImage from "./sticker-image";

export default function LilGwapzExperience({
  initialCharacter = "ALL",
}: {
  initialCharacter?: CharacterFilter;
}) {
  const [character, setCharacter] = useState(initialCharacter);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Sticker | null>(null);
  const results = useMemo(
    () => filterStickers(character, query),
    [character, query],
  );
  const choose = (value: CharacterFilter) => {
    setCharacter(value);
    const url = new URL(window.location.href);
    if (value === "ALL") url.searchParams.delete("character");
    else url.searchParams.set("character", value);
    window.history.replaceState(null, "", url.pathname + url.search);
  };
  return (
    <main className="lg-browser">
      <a href="#lg-reactions" className="lg-skip">
        Skip to reactions
      </a>
      <div className="lg-browser-toolbar">
        <header className="lg-browser-header">
          <Link
            href="/lil-gwapz"
            className="lg-back"
            aria-label="Back to Lil Gwapz home"
          >
            <ArrowLeft weight="bold" aria-hidden />
          </Link>
          <Link href="/lil-gwapz" className="lg-browser-logo">
            <Image
              src="/lil-gwapz/brand/logo.png"
              width={1536}
              height={1024}
              alt="Lil Gwapz"
              priority
            />
          </Link>
          <span className="lg-count" aria-live="polite">
            {results.length}
            <span> {results.length === 1 ? "sticker" : "stickers"}</span>
          </span>
        </header>
        <h1 className="lg-sr-only">Browse all 152 Lil Gwapz reactions</h1>
        <label className="lg-search">
          <MagnifyingGlass aria-hidden />
          <input
            type="search"
            aria-label="Search reactions"
            placeholder="Search reactions"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <X aria-hidden />
            </button>
          )}
        </label>
        <div
          className="lg-character-tabs"
          role="group"
          aria-label="Filter by character"
        >
          {(["ALL", "M", "F"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={character === value}
              onClick={() => choose(value)}
            >
              {value === "ALL" ? "All" : characterName(value)}
            </button>
          ))}
        </div>
      </div>
      <div className="lg-browse-hint">
        <span>Tap a reaction to save or share</span>
        <span>Original quality PNG</span>
      </div>
      <section
        id="lg-reactions"
        aria-label="Reaction stickers"
        className="lg-sticker-grid"
      >
        {results.map((s, i) => (
          <button
            type="button"
            key={s.key}
            className="lg-sticker-card"
            onClick={() => setSelected(s)}
            aria-label={"Preview " + s.reaction + ", " + characterName(s.sex)}
          >
            <StickerImage sticker={s} priority={i < 4} />
            <span className="lg-sticker-caption">
              <strong>{s.reaction}</strong>
              <span>{characterName(s.sex)}</span>
            </span>
          </button>
        ))}
      </section>
      {!results.length && (
        <div className="lg-empty" role="status">
          <MagnifyingGlass aria-hidden />
          <h2>No reactions found</h2>
          <p>Try “love,” “laugh,” or a different character.</p>
          <button
            className="lg-button"
            type="button"
            onClick={() => {
              setQuery("");
              choose("ALL");
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      <footer className="lg-browser-footer">
        <Link href="/lil-gwapz#how-to-use">Need help saving a sticker?</Link>
        <span>152 originals. Every kind of energy.</span>
      </footer>
      {selected && (
        <StickerDialog
          key={selected.key}
          sticker={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
function StickerDialog({
  sticker,
  onClose,
}: {
  sticker: Sticker;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [light, setLight] = useState(false);
  useEffect(() => {
    const dialog = ref.current;
    const focus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      focus?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(originalUrl(sticker), { signal: controller.signal })
      .then(async (response) => {
        if (
          !response.ok ||
          !response.headers.get("content-type")?.startsWith("image/png")
        )
          throw new Error("Original unavailable");
        const blob = await response.blob();
        if (blob.size !== sticker.asset.bytes)
          throw new Error("Incomplete original");
        if (!controller.signal.aborted)
          setFile(
            new File([blob], sticker.asset.filename, { type: "image/png" }),
          );
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [sticker, attempt]);
  // Fetch before tapping Share to preserve the transient activation needed by iOS.
  const share = async () => {
    if (!file) return;
    if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
      setStatus(
        "Your browser doesn’t support file sharing. Use Download PNG, then attach it in your app.",
      );
      return;
    }
    setSharing(true);
    setStatus("");
    try {
      await navigator.share({
        files: [file],
        title: sticker.reaction + " — Lil Gwapz",
      });
      setStatus("Share menu closed.");
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setStatus("Couldn’t open Share. Try Download PNG instead.");
    } finally {
      setSharing(false);
    }
  };
  return (
    <dialog
      ref={ref}
      className={"lg-sheet" + (zoomed ? " lg-sheet-zoomed" : "")}
      aria-labelledby="lg-sheet-title"
      aria-describedby="lg-sheet-quality"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          onClose();
      }}
    >
      <button
        className="lg-close"
        type="button"
        onClick={onClose}
        aria-label="Close sticker preview"
        autoFocus
      >
        <X weight="bold" aria-hidden />
      </button>
      <div className={"lg-sheet-preview" + (light ? " light" : "")}>
        <StickerImage sticker={sticker} full />
        <div className="lg-preview-tools">
          <button
            type="button"
            aria-label={zoomed ? "Exit large preview" : "Enlarge preview"}
            aria-pressed={zoomed}
            onClick={() => setZoomed(!zoomed)}
          >
            <ArrowsOutSimple aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Preview on light background"
            aria-pressed={light}
            onClick={() => setLight(!light)}
          >
            {light ? "Dark" : "Light"}
          </button>
        </div>
      </div>
      <div className="lg-sheet-content">
        <p className="lg-eyebrow">
          {characterName(sticker.sex)} · REACTION PACK 01
        </p>
        <h2 id="lg-sheet-title">{sticker.reaction}</h2>
        <p id="lg-sheet-quality" className="lg-file-info">
          1254 × 1254 · Transparent PNG ·{" "}
          {(sticker.asset.bytes / 1024 / 1024).toFixed(1)} MB
        </p>
        <a
          className="lg-button lg-download"
          href={originalUrl(sticker)}
          download={sticker.asset.filename}
          onClick={() =>
            setStatus(
              "Download requested. Look in Files or Downloads on your device.",
            )
          }
        >
          <DownloadSimple weight="bold" aria-hidden /> Download PNG
        </a>
        <button
          type="button"
          className="lg-button lg-share"
          disabled={!file || sharing}
          onClick={() => void share()}
        >
          <ShareNetwork aria-hidden />
          {sharing
            ? "Opening Share…"
            : !file && !failed
              ? "Preparing Share…"
              : "Share"}
        </button>
        {failed && (
          <button
            className="lg-retry"
            type="button"
            onClick={() => {
              setFailed(false);
              setAttempt(attempt + 1);
            }}
          >
            <ArrowClockwise aria-hidden /> Retry loading original for Share
          </button>
        )}
        <a
          className="lg-original-link"
          href={originalUrl(sticker)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open original image <ArrowSquareOut aria-hidden />
        </a>
        <p className="lg-action-status" role="status">
          {status ||
            "The full-resolution original. Ready for your next conversation."}
        </p>
      </div>
    </dialog>
  );
}
