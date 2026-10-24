"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getLilGwapzMood, LIL_GWAPZ_MOODS, type LilGwapzMood } from "../lib/lil-gwapz-moods";
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
        image.onerror = () => { atlasCache.delete(src); reject(new Error("Sticker artwork could not load. Please try again.")); };
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
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [mood, setMood] = useState<LilGwapzMood>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<StickerChoice | null>(null);
  const [busy, setBusy] = useState<"download" | "share" | null>(null);
  const [status, setStatus] = useState("");
  const [activeSection, setActiveSection] = useState("explore");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase().replace(/[-’'.,!?]+/g, " ").replace(/\s+/g, " ").trim();
    const rows: StickerChoice[] = [];
    for (const reaction of reactions) {
      if (mood !== "all" && getLilGwapzMood(reaction.id) !== mood) continue;
      const haystack = [reaction.reaction, reaction.emoji, ...reaction.keywords, formatId(reaction.id)]
        .join(" ").toLowerCase().replace(/[-’'.,!?]+/g, " ").replace(/\s+/g, " ");
      if (normalized && !haystack.includes(normalized)) continue;
      if (filter === "ALL" || filter === "M") rows.push({ reaction, sex: "M", frame: reaction.male });
      if (filter === "ALL" || filter === "F") rows.push({ reaction, sex: "F", frame: reaction.female });
    }
    return rows;
  }, [filter, query, mood]);

  const goTo = useCallback((id: string) => {
    setActiveSection(id === "packs" ? "packs" : id === "guide" ? "guide" : "explore");
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
    document.getElementById(`lg-${id}`)?.scrollIntoView({ behavior, block: "start" });
  }, []);

  const browseMood = (value: LilGwapzMood) => {
    setMood(value);
    setQuery("");
    requestAnimationFrame(() => goTo("gallery"));
  };

  const browseAll = () => {
    setMood("all"); setFilter("ALL"); setQuery("");
    requestAnimationFrame(() => goTo("gallery"));
  };

  const downloadSticker = useCallback(async (choice: StickerChoice) => {
    setBusy("download"); setStatus("");
    try {
      const blob = await stickerBlob(choice);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = fileName(choice);
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setStatus("PNG prepared. Find it in your device’s Files or Downloads.");
    } catch {
      setStatus("Could not prepare this sticker. Check your connection and try again.");
    } finally { setBusy(null); }
  }, []);

  const shareSticker = useCallback(async (choice: StickerChoice) => {
    setBusy("share"); setStatus("");
    try {
      const blob = await stickerBlob(choice);
      const file = new File([blob], fileName(choice), { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: `${choice.reaction.reaction} — Lil Gwapz`, files: [file] });
        setStatus("Shared.");
      } else { await downloadSticker(choice); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setStatus("Sharing is unavailable here. Try Download PNG instead.");
      }
    } finally { setBusy(null); }
  }, [downloadSticker]);

  useEffect(() => {
    if (!selected) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [selected]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) {
        const id = entry.target.id.replace("lg-", "");
        setActiveSection(id === "gallery" ? "explore" : id);
      }
    }, { rootMargin: "-15% 0px -60% 0px" });
    ["explore", "packs", "gallery", "guide"].forEach((id) => {
      const section = document.getElementById(`lg-${id}`);
      if (section) observer.observe(section);
    });
    return () => observer.disconnect();
  }, []);

  const heroMale = reactions[20];
  const heroFemale = reactions[11];
  const previews: StickerChoice[] = [
    { reaction: reactions[30], sex: "M", frame: reactions[30].male },
    { reaction: reactions[61], sex: "F", frame: reactions[61].female },
    { reaction: reactions[12], sex: "M", frame: reactions[12].male },
    { reaction: reactions[41], sex: "F", frame: reactions[41].female },
  ];
  const openSticker = (choice: StickerChoice) => { setStatus(""); setSelected(choice); };

  return (
    <main className="lil-gwapz-page">
      <a className="lg-skip" href="#lg-gallery">Skip to reactions</a>
      <header className="lg-site-nav">
        <a href="#lg-explore" className="lg-nav-brand" aria-label="Lil Gwapz home">
          <Crown /><span>Lil <b>Gwapz</b></span>
        </a>
        <nav className="lg-nav-links" aria-label="Lil Gwapz navigation">
          <a href="#lg-gallery">Explore</a><a href="#lg-packs">Packs</a><a href="#lg-guide">Guide</a>
        </nav>
        <Link href="/" className="lg-nav-exit">GwapSpot</Link>
      </header>

      <section className="lg-hero" id="lg-explore" aria-labelledby="lil-gwapz-title">
        <div className="lg-hero-copy">
          <p className="lg-eyebrow">SMALL CHARACTERS. BIG ENERGY.</p>
          <h1 id="lil-gwapz-title">A REACTION<br />FOR EVERY<br /><span>MOOD.</span></h1>
          <p className="lg-hero-subcopy">Same energy. Different expressions.</p>
          <button type="button" className="lg-primary" onClick={() => goTo("moods")}>Find my mood <Spark /></button>
        </div>
        <div className="lg-hero-art" aria-label="Male and female Lil Gwapz characters">
          <span className="lg-art-spark spark-one" aria-hidden="true">✦</span>
          <span className="lg-art-spark spark-two" aria-hidden="true">✦</span>
          <div className="lg-hero-character character-male"><span className="lg-hero-sprite" style={spriteStyle(heroMale.male)} role="img" aria-label="Male Lil Gwapz crying laugh" /></div>
          <div className="lg-hero-character character-female"><span className="lg-hero-sprite" style={spriteStyle(heroFemale.female)} role="img" aria-label="Female Lil Gwapz blowing a kiss" /></div>
          <span className="lg-art-tag" aria-hidden="true">BIG MOOD ENERGY</span>
        </div>
      </section>

      <section className="lg-moods" id="lg-moods" aria-labelledby="lg-moods-title">
        <div className="lg-section-heading"><h2 id="lg-moods-title">Browse by mood</h2><span>Your mood. Your reaction.</span></div>
        <div className="lg-mood-row" role="group" aria-label="Choose a mood">
          {LIL_GWAPZ_MOODS.map((item) => (
            <button key={item.id} type="button" className={`lg-mood ${item.color}`} aria-pressed={mood === item.id} onClick={() => browseMood(item.id)}>
              <span className="lg-mood-orb" aria-hidden="true">{item.emoji}</span><span>{item.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="lg-featured" id="lg-packs" aria-labelledby="lg-pack-title">
        <div className="lg-featured-copy">
          <p className="lg-eyebrow">THE FIRST COLLECTION</p>
          <h2 id="lg-pack-title">Reaction Pack 01</h2>
          <p>76 expressions. Two characters.<br />152 ways to say what you feel.</p>
          <button type="button" onClick={browseAll}>Explore the pack <span aria-hidden="true">✦</span></button>
        </div>
        <div className="lg-featured-art" aria-hidden="true">
          <span style={spriteStyle(reactions[5].male)} /><span style={spriteStyle(reactions[4].female)} />
        </div>
        <span className="lg-pack-stamp">152<br /><small>STICKERS</small></span>
      </section>

      <section className="lg-sneak" aria-labelledby="lg-sneak-title">
        <div className="lg-section-heading"><h2 id="lg-sneak-title">A little preview</h2><button type="button" onClick={browseAll}>See all reactions</button></div>
        <div className="lg-preview-grid">
          {previews.map((choice) => (
            <button key={choice.reaction.id} type="button" className={`lg-preview-card ${colorClass[choice.reaction.color]}`} onClick={() => openSticker(choice)} aria-label={`Preview ${choice.reaction.reaction}, ${choice.sex === "M" ? "male" : "female"}`}>
              <span className="lg-sticker-sprite" style={spriteStyle(choice.frame)} aria-hidden="true" />
              <strong>{choice.reaction.reaction}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="lg-gallery" id="lg-gallery" ref={galleryRef} aria-labelledby="reaction-browser-title">
        <div className="lg-browser-heading"><div><p className="lg-eyebrow">FIND YOUR NEXT REACTION</p><h2 id="reaction-browser-title">The reaction vault.</h2></div><span className="lg-result-count" aria-live="polite">{filtered.length} stickers</span></div>
        <div className="lg-browser-toolbar">
          <label className="lg-search"><SearchIcon /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find your reaction…" aria-label="Search reactions" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search">×</button>}</label>
          <div className="lg-filters" role="group" aria-label="Filter by character">
            {(["ALL", "M", "F"] as const).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "ALL" ? "All" : value === "M" ? "Male" : "Female"}</button>)}
          </div>
          <div className="lg-mood-chips" role="group" aria-label="Filter reactions by mood">
            {LIL_GWAPZ_MOODS.map((item) => <button key={item.id} type="button" aria-pressed={mood === item.id} onClick={() => setMood(item.id)}>{item.label}</button>)}
          </div>
        </div>
        <div className="lg-sticker-grid">
          {filtered.map((choice) => <button key={`${choice.reaction.id}-${choice.sex}`} className={`lg-sticker-card ${colorClass[choice.reaction.color]}`} type="button" onClick={() => openSticker(choice)} aria-label={`${choice.reaction.reaction}, ${choice.sex === "M" ? "male" : "female"} Lil Gwapz`}>
            <span className="lg-sticker-sprite" style={spriteStyle(choice.frame)} aria-hidden="true" />
            <span className="lg-sticker-meta"><small>{choice.sex === "M" ? "MALE" : "FEMALE"}</small><strong>{choice.reaction.reaction}</strong></span>
          </button>)}
        </div>
        {filtered.length === 0 && <div className="lg-empty" role="status"><strong>No reaction found.</strong><p>Try another word, mood, or character.</p><button type="button" onClick={browseAll}>Reset filters</button></div>}
      </section>

      <section className="lg-guide" id="lg-guide" aria-labelledby="lg-guide-title">
        <p className="lg-eyebrow">TAKE YOUR MOOD WITH YOU</p><h2 id="lg-guide-title">Tap. Save. Send.</h2>
        <div className="lg-guide-grid">
          <article><b>01</b><h3>Pick a reaction</h3><p>Find your mood and tap a sticker to open it.</p></article>
          <article><b>02</b><h3>Save the PNG</h3><p>Download a transparent image to Files or Downloads on your phone or computer.</p></article>
          <article><b>03</b><h3>Share the energy</h3><p>Use Share on supported devices, or attach the saved image in your favorite app.</p></article>
        </div>
        <p className="lg-guide-note">Saving a PNG does not install a keyboard or an in-app sticker pack. Use your app’s image or sticker tools to add it.</p>
      </section>
      <footer className="lg-footer"><a className="lg-nav-brand" href="#lg-explore">Lil <b>Gwapz</b></a><p>An original GWAP collection.</p><Link href="/">Back to GwapSpot</Link></footer>
      <nav className="lg-bottom-nav" aria-label="Quick navigation">
        {(["explore", "packs", "guide"] as const).map((id) => <button key={id} type="button" aria-current={activeSection === id ? "location" : undefined} onClick={() => goTo(id === "explore" ? "gallery" : id)}><NavIcon kind={id} /><span>{id === "explore" ? "Explore" : id === "packs" ? "Packs" : "Guide"}</span></button>)}
      </nav>
      {selected && <dialog ref={dialogRef} className="lg-sheet" aria-labelledby="lg-sheet-title" onCancel={() => setSelected(null)} onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setSelected(null); } }}>
        <button type="button" className="lg-close" onClick={() => setSelected(null)} aria-label="Close sticker actions" autoFocus>×</button>
        <div className="lg-sheet-preview"><span className="lg-sheet-sprite" style={spriteStyle(selected.frame)} role="img" aria-label={`${selected.reaction.reaction}, ${selected.sex === "M" ? "male" : "female"} Lil Gwapz`} /></div>
        <div className="lg-sheet-copy"><p>{selected.sex === "M" ? "MALE" : "FEMALE"} · REACTION PACK 01</p><h2 id="lg-sheet-title">{selected.reaction.reaction}</h2></div>
        <button className="lg-sheet-primary" type="button" disabled={busy !== null} onClick={() => void downloadSticker(selected)}>{busy === "download" ? "Preparing PNG…" : "Download PNG"}</button>
        <button className="lg-sheet-secondary" type="button" disabled={busy !== null} onClick={() => void shareSticker(selected)}>{busy === "share" ? "Opening Share…" : "Share"}</button>
        {status && <p className="lg-action-status" role="status">{status}</p>}
      </dialog>}
    </main>
  );
}

function Crown() { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="m3 7 5 4 4-7 4 7 5-4-3 12H6L3 7Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>; }
function Spark() { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z" stroke="currentColor" strokeWidth="1.8" /></svg>; }
function SearchIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>; }
function NavIcon({ kind }: { kind: "explore" | "packs" | "guide" }) {
  const paths = { explore: "m3 10 9-7 9 7v10H3V10Zm5 10v-7h8v7", packs: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5", guide: "M12 5c-4-2-8-2-10 0v15c3-2 7-2 10 0 3-2 7-2 10 0V5c-2-2-6-2-10 0Zm0 0v15" };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d={paths[kind]} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}
