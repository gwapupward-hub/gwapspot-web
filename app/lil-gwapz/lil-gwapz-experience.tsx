"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import stickerData from "../lib/lil-gwapz-stickers.generated.json";

type Sex = "M" | "F";
type Filter = "ALL" | Sex;

type Frame = {
  atlas: string;
  col: number;
  row: number;
  cols: number;
  rows: number;
  revision: number;
};

type Reaction = {
  id: number;
  reaction: string;
  color: string;
  emoji: string;
  keywords: string[];
  male: Frame;
  female: Frame;
};

type StickerChoice = {
  reaction: Reaction;
  sex: Sex;
  frame: Frame;
};

const reactions = stickerData as Reaction[];
const atlasUrls: Record<string, string> = {
  "male-a": "https://res.cloudinary.com/dg1u1wpdu/image/upload/v1791405790/lil-gwapz/reaction-pack-01/atlas/male-a.webp",
  "male-b": "https://res.cloudinary.com/dg1u1wpdu/image/upload/v1791405800/lil-gwapz/reaction-pack-01/atlas/male-b.webp",
  "female-a": "https://res.cloudinary.com/dg1u1wpdu/image/upload/v1791405811/lil-gwapz/reaction-pack-01/atlas/female-a.webp",
  "female-b": "https://res.cloudinary.com/dg1u1wpdu/image/upload/v1791405820/lil-gwapz/reaction-pack-01/atlas/female-b.webp",
};

const atlasUrl = (atlas: string) => atlasUrls[atlas] ?? "";
const colorClass: Record<string, string> = {
  GRN: "green",
  ORG: "orange",
  RED: "red",
  PUR: "purple",
};

const atlasCache = new Map<string, Promise<HTMLImageElement>>();

function loadAtlas(src: string) {
  if (!atlasCache.has(src)) {
    atlasCache.set(
      src,
      new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.decoding = "async";
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
      }),
    );
  }
  return atlasCache.get(src)!;
}

function spriteStyle(frame: Frame): React.CSSProperties {
  const x = frame.cols <= 1 ? 0 : (frame.col / (frame.cols - 1)) * 100;
  const y = frame.rows <= 1 ? 0 : (frame.row / (frame.rows - 1)) * 100;
  return {
    backgroundImage: `url(${atlasUrl(frame.atlas)})`,
    backgroundSize: `${frame.cols * 100}% ${frame.rows * 100}%`,
    backgroundPosition: `${x}% ${y}%`,
  };
}

function formatId(id: number) {
  return `LG-R01-${String(id).padStart(3, "0")}`;
}

async function stickerBlob(choice: StickerChoice) {
  const image = await loadAtlas(atlasUrl(choice.frame.atlas));
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");

  ctx.clearRect(0, 0, 512, 512);
  ctx.drawImage(
    image,
    choice.frame.col * 192,
    choice.frame.row * 192,
    192,
    192,
    0,
    0,
    512,
    512,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("PNG export failed."))),
      "image/png",
    );
  });
}

function fileName(choice: StickerChoice) {
  return `${formatId(choice.reaction.id)}-${choice.sex}-${choice.reaction.color}-Lil-Gwapz.png`;
}

export default function LilGwapzExperience() {
  const galleryRef = useRef<HTMLElement | null>(null);
  const guideRef = useRef<HTMLElement | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<StickerChoice | null>(null);
  const [busy, setBusy] = useState<"download" | "share" | null>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const rows: StickerChoice[] = [];

    for (const reaction of reactions) {
      const haystack = [
        reaction.reaction,
        reaction.emoji,
        ...reaction.keywords,
        formatId(reaction.id),
      ]
        .join(" ")
        .toLowerCase();

      if (normalized && !haystack.includes(normalized)) continue;
      if (filter === "ALL" || filter === "M") {
        rows.push({ reaction, sex: "M", frame: reaction.male });
      }
      if (filter === "ALL" || filter === "F") {
        rows.push({ reaction, sex: "F", frame: reaction.female });
      }
    }

    return rows;
  }, [filter, query]);

  const scrollToGallery = useCallback((nextFilter?: Filter) => {
    if (nextFilter) setFilter(nextFilter);
    requestAnimationFrame(() => {
      galleryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const scrollToGuide = useCallback(() => {
    guideRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const downloadSticker = useCallback(async (choice: StickerChoice) => {
    setBusy("download");
    try {
      const blob = await stickerBlob(choice);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName(choice);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setBusy(null);
    }
  }, []);

  const shareSticker = useCallback(
    async (choice: StickerChoice) => {
      setBusy("share");
      try {
        const blob = await stickerBlob(choice);
        const file = new File([blob], fileName(choice), { type: "image/png" });
        if (
          navigator.share &&
          (!navigator.canShare || navigator.canShare({ files: [file] }))
        ) {
          await navigator.share({
            title: `${choice.reaction.reaction} — Lil Gwapz`,
            text: "Lil Gwapz — Reaction Pack 01",
            files: [file],
          });
        } else {
          await downloadSticker(choice);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        await downloadSticker(choice);
      } finally {
        setBusy(null);
      }
    },
    [downloadSticker],
  );

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  const heroMale = reactions[20];
  const heroFemale = reactions[11];

  return (
    <main className="lil-gwapz-page">
      <nav className="lg-site-nav" aria-label="Lil Gwapz navigation">
        <button
          type="button"
          className="lg-nav-brand"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Back to Lil Gwapz top"
        >
          <span className="lg-nav-crown">♛</span>
          <span>LIL GWAPZ</span>
        </button>
        <div className="lg-nav-links">
          <button type="button" onClick={() => scrollToGallery("ALL")}>Browse</button>
          <button type="button" onClick={() => scrollToGallery("M")}>Male</button>
          <button type="button" onClick={() => scrollToGallery("F")}>Female</button>
          <button type="button" onClick={scrollToGuide}>Use</button>
        </div>
        <Link href="/" className="lg-nav-exit" aria-label="Return to GwapSpot">
          GWAP<span aria-hidden="true">↗</span>
        </Link>
      </nav>

      <section className="lg-hero" aria-labelledby="lil-gwapz-title">
        <div className="lg-graffiti" aria-hidden="true">
          <span>♛</span><span>♛</span><span>×</span><span>♛</span>
        </div>

        <div className="lg-hero-lockup">
          <p className="lg-eyebrow">AN ORIGINAL GWAP COLLECTION</p>
          <div className="lg-wordmark" aria-label="Lil Gwapz">
            <span className="lg-wordmark-lil">LIL</span>
            <span className="lg-wordmark-gwapz">GWAPZ</span>
          </div>
          <div className="lg-pack-tag">REACTION PACK 01</div>
          <h1 id="lil-gwapz-title">PICK YOUR <span>VIBE.</span></h1>
          <p className="lg-hero-subcopy">76 reactions each. <strong>152 ways to say it.</strong></p>
        </div>

        <div className="lg-vibe-grid">
          <button className="lg-vibe-card male" type="button" onClick={() => scrollToGallery("M")}>
            <span className="lg-vibe-label">MALE</span>
            <span className="lg-hero-sprite" style={spriteStyle(heroMale.male)} aria-hidden="true" />
            <span className="lg-vibe-copy">
              <small>76 REACTIONS</small>
              <strong>LIL GWAPZ</strong>
              <span>View male pack <b>→</b></span>
            </span>
          </button>

          <button className="lg-vibe-card female" type="button" onClick={() => scrollToGallery("F")}>
            <span className="lg-vibe-label">FEMALE</span>
            <span className="lg-hero-sprite" style={spriteStyle(heroFemale.female)} aria-hidden="true" />
            <span className="lg-vibe-copy">
              <small>76 REACTIONS</small>
              <strong>LIL GWAPZ</strong>
              <span>View female pack <b>→</b></span>
            </span>
          </button>
        </div>

        <div className="lg-hero-actions">
          <button type="button" className="lg-primary" onClick={() => scrollToGallery("ALL")}>
            Browse All 152 <span>→</span>
          </button>
          <button className="lg-secondary" type="button" onClick={scrollToGuide}>
            How to save & share <span>↓</span>
          </button>
        </div>

        <div className="lg-stat-strip" aria-label="Reaction Pack 01 details">
          <span><strong>76</strong> expressions</span>
          <span><strong>2</strong> character versions</span>
          <span><strong>152</strong> stickers</span>
        </div>
      </section>

      <section className="lg-gallery" ref={galleryRef} aria-labelledby="reaction-browser-title">
        <div className="lg-browser-heading">
          <div>
            <p>REACTION PACK 01</p>
            <h2 id="reaction-browser-title">Find the reaction.</h2>
          </div>
          <span className="lg-result-count" aria-live="polite">{filtered.length} stickers</span>
        </div>

        <div className="lg-browser-toolbar">
          <label className="lg-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search reactions"
              aria-label="Search reactions"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button>
            )}
          </label>

          <div className="lg-filters" role="group" aria-label="Filter by character">
            {(["ALL", "M", "F"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={filter === value ? "active" : ""}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {value === "ALL" ? "All" : value === "M" ? "Male" : "Female"}
              </button>
            ))}
          </div>
        </div>

        <div className="lg-sticker-grid">
          {filtered.map((choice) => (
            <button
              key={`${choice.reaction.id}-${choice.sex}`}
              className={`lg-sticker-card ${colorClass[choice.reaction.color] ?? "green"}`}
              type="button"
              onClick={() => setSelected(choice)}
              aria-label={`${choice.reaction.reaction}, ${choice.sex === "M" ? "male" : "female"} Lil Gwapz`}
            >
              <span className="lg-card-glow" aria-hidden="true" />
              <span className="lg-sticker-sprite" style={spriteStyle(choice.frame)} aria-hidden="true" />
              <span className="lg-sticker-meta">
                <span className="lg-meta-topline">
                  <small>{choice.sex === "M" ? "MALE" : "FEMALE"}</small>
                  <i>{formatId(choice.reaction.id).replace("LG-R01-", "#")}</i>
                </span>
                <strong>{choice.reaction.reaction}</strong>
              </span>
            </button>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="lg-empty">
            <strong>No match.</strong>
            <span>Try another mood, phrase, or reaction number.</span>
          </div>
        )}
      </section>

      <section className="lg-guide" ref={guideRef} aria-labelledby="lg-guide-title">
        <div className="lg-guide-copy">
          <p>USE THEM ANYWHERE</p>
          <h2 id="lg-guide-title">Tap. Save. Send.</h2>
          <span>Lil Gwapz is built for phones first — download the PNG or open your device share sheet directly from any sticker.</span>
        </div>
        <div className="lg-guide-grid">
          <article><b>01</b><strong>Pick a reaction</strong><span>Search by mood, phrase, or browse the male and female packs.</span></article>
          <article><b>02</b><strong>Open the sticker</strong><span>Tap any card for a focused preview and quick actions.</span></article>
          <article><b>03</b><strong>Save or share</strong><span>Keep the transparent PNG or send it through your phone’s native share sheet.</span></article>
        </div>
      </section>

      <footer className="lg-footer">
        <div>
          <span className="lg-footer-crown">♛</span>
          <strong>LIL GWAPZ</strong>
          <small>REACTION PACK 01 · 152 STICKERS</small>
        </div>
        <button type="button" onClick={() => scrollToGallery("ALL")}>Browse collection <span>→</span></button>
        <Link href="/">Back to GwapSpot</Link>
      </footer>

      {selected && (
        <div className="lg-sheet-backdrop" role="presentation" onMouseDown={() => setSelected(null)}>
          <section
            className="lg-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lg-sheet-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className="lg-sheet-handle" aria-hidden="true" />
            <button type="button" className="lg-close" onClick={() => setSelected(null)} aria-label="Close sticker actions">×</button>
            <div className="lg-sheet-preview">
              <span className="lg-sheet-sprite" style={spriteStyle(selected.frame)} aria-hidden="true" />
            </div>
            <div className="lg-sheet-copy">
              <p>REACTION · {selected.sex === "M" ? "MALE" : "FEMALE"}</p>
              <h2 id="lg-sheet-title">{selected.reaction.reaction}</h2>
              <span>{formatId(selected.reaction.id)} · {selected.reaction.emoji} {selected.reaction.keywords.join(" · ")}</span>
            </div>
            <button className="lg-sheet-primary" type="button" disabled={busy !== null} onClick={() => downloadSticker(selected)}>
              {busy === "download" ? "Preparing PNG…" : "Download PNG"}
            </button>
            <button className="lg-sheet-secondary" type="button" disabled={busy !== null} onClick={() => shareSticker(selected)}>
              {busy === "share" ? "Opening Share…" : "Share"}
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
