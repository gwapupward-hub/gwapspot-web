"use client";

import { useCallback, useMemo, useRef, useState } from "react";
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
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG export failed."))), "image/png");
  });
}

function fileName(choice: StickerChoice) {
  return `${formatId(choice.reaction.id)}-${choice.sex}-${choice.reaction.color}-Lil-Gwapz.png`;
}

export default function LilGwapzExperience() {
  const galleryRef = useRef<HTMLElement | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<StickerChoice | null>(null);
  const [busy, setBusy] = useState<"download" | "share" | null>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const rows: StickerChoice[] = [];
    for (const reaction of reactions) {
      const haystack = [reaction.reaction, reaction.emoji, ...reaction.keywords, formatId(reaction.id)]
        .join(" ")
        .toLowerCase();
      if (normalized && !haystack.includes(normalized)) continue;
      if (filter === "ALL" || filter === "M") rows.push({ reaction, sex: "M", frame: reaction.male });
      if (filter === "ALL" || filter === "F") rows.push({ reaction, sex: "F", frame: reaction.female });
    }
    return rows;
  }, [filter, query]);

  const scrollToGallery = useCallback((nextFilter?: Filter) => {
    if (nextFilter) setFilter(nextFilter);
    requestAnimationFrame(() => galleryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
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

  const shareSticker = useCallback(async (choice: StickerChoice) => {
    setBusy("share");
    try {
      const blob = await stickerBlob(choice);
      const file = new File([blob], fileName(choice), { type: "image/png" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
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
  }, [downloadSticker]);

  const heroMale = reactions[1];
  const heroFemale = reactions[4];

  return (
    <main className="lil-gwapz-page">
      <section className="lg-hero" aria-labelledby="lil-gwapz-title">
        <header className="lg-header">
          <a href="/" className="lg-brand" aria-label="GWAP home">
            <span className="lg-gmark">G</span>
            <span className="lg-logo-text">LIL GWAPZ</span>
          </a>
          <span className="lg-pack-pill">REACTION PACK 01</span>
        </header>

        <div className="lg-hero-copy">
          <p className="lg-eyebrow">AN ORIGINAL GWAP COLLECTION</p>
          <h1 id="lil-gwapz-title">PICK YOUR <span>VIBE.</span></h1>
          <p>76 reactions each. <strong>152 ways to say it.</strong></p>
        </div>

        <div className="lg-vibe-grid">
          <button className="lg-vibe-card male" type="button" onClick={() => scrollToGallery("M")}>
            <span className="lg-spray">MALE</span>
            <span className="lg-hero-sprite" style={spriteStyle(heroMale.male)} aria-hidden="true" />
            <span className="lg-vibe-copy">
              <strong>LIL GWAPZ</strong>
              <small>MALE · 76 REACTIONS</small>
              <span>View Pack <b>→</b></span>
            </span>
          </button>
          <button className="lg-vibe-card female" type="button" onClick={() => scrollToGallery("F")}>
            <span className="lg-spray">FEMALE</span>
            <span className="lg-hero-sprite" style={spriteStyle(heroFemale.female)} aria-hidden="true" />
            <span className="lg-vibe-copy">
              <strong>LIL GWAPZ</strong>
              <small>FEMALE · 76 REACTIONS</small>
              <span>View Pack <b>→</b></span>
            </span>
          </button>
        </div>

        <div className="lg-hero-actions">
          <button type="button" className="lg-primary" onClick={() => scrollToGallery("ALL")}>Browse All 152 <span>→</span></button>
          <button className="lg-secondary" type="button" onClick={() => scrollToGallery("ALL")}>Save Individual PNGs <span>↓</span></button>
        </div>
      </section>

      <section className="lg-gallery" ref={galleryRef} aria-labelledby="reaction-browser-title">
        <div className="lg-section-head">
          <div>
            <p>REACTION PACK 01</p>
            <h2 id="reaction-browser-title">Find your reaction.</h2>
          </div>
          <span>{filtered.length} STICKERS</span>
        </div>

        <label className="lg-search">
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reactions" aria-label="Search reactions" />
        </label>

        <div className="lg-filters" role="group" aria-label="Filter by character">
          {(["ALL", "M", "F"] as const).map((value) => (
            <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
              {value === "ALL" ? "All" : value === "M" ? "Male" : "Female"}
            </button>
          ))}
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
              <span className="lg-sticker-sprite" style={spriteStyle(choice.frame)} aria-hidden="true" />
              <span className="lg-sticker-meta">
                <strong>{choice.reaction.reaction}</strong>
                <small>{formatId(choice.reaction.id)} · {choice.sex}</small>
              </span>
            </button>
          ))}
        </div>

        {filtered.length === 0 && <p className="lg-empty">No reaction matched that search.</p>}
      </section>

      <section className="lg-footer-cta">
        <p>Keep the whole collection on your device.</p>
        <h2>152 reactions. Ready when the group chat gets reckless.</h2>
        <button type="button" onClick={() => scrollToGallery("ALL")}>Browse All 152 <span>→</span></button>
        <small>Tap any sticker to save a PNG or open your phone’s Share sheet. Lil Gwapz remains separate from the original GwapMojis collection.</small>
      </section>

      {selected && (
        <div className="lg-sheet-backdrop" role="presentation" onMouseDown={() => setSelected(null)}>
          <section className="lg-sheet" role="dialog" aria-modal="true" aria-labelledby="lg-sheet-title" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="lg-close" onClick={() => setSelected(null)} aria-label="Close sticker actions">×</button>
            <div className="lg-sheet-preview">
              <span className="lg-sheet-sprite" style={spriteStyle(selected.frame)} aria-hidden="true" />
            </div>
            <div className="lg-sheet-copy">
              <p>{formatId(selected.reaction.id)} · {selected.sex === "M" ? "MALE" : "FEMALE"}</p>
              <h2 id="lg-sheet-title">{selected.reaction.reaction}</h2>
              <span>{selected.reaction.emoji} {selected.reaction.keywords.join(" · ")}</span>
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
