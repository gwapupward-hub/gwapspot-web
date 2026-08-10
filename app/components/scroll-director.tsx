"use client";

import { useEffect, useRef, useState } from "react";

const chapters = [
  { id: "top", label: "Intro" },
  { id: "overview", label: "System" },
  { id: "ecosystem", label: "Products" },
  { id: "trust", label: "Trust" },
  { id: "roadmap", label: "Roadmap" },
  { id: "community", label: "Community" },
] as const;

type ChapterId = (typeof chapters)[number]["id"];

type SectionMeasurement = { top: number; bottom: number };

const chapterNavSelectors: Partial<Record<ChapterId, string>> = {
  ecosystem: '.cinematic-links a[href="#ecosystem"]',
  trust: '.cinematic-links a[href="#trust"]',
  roadmap: '.cinematic-links a[href="#roadmap"]',
  community: '.cinematic-links a[href="/community"]',
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);
const smoothstep = (value: number) => value * value * (3 - 2 * value);

function getContinuousChapterProgress(focusLine: number, measurements: SectionMeasurement[]) {
  if (measurements.length <= 1) return 0;

  const centers = measurements.map(({ top, bottom }) => (top + bottom) / 2);
  if (focusLine <= centers[0]) return 0;

  for (let index = 0; index < centers.length - 1; index += 1) {
    const start = centers[index];
    const end = centers[index + 1];
    if (focusLine <= end) {
      const localProgress = clamp((focusLine - start) / Math.max(end - start, 1), 0, 1);
      return (index + localProgress) / (centers.length - 1);
    }
  }

  return 1;
}

export function ScrollDirector() {
  const [activeChapter, setActiveChapter] = useState(0);
  const activeChapterRef = useRef(-1);

  useEffect(() => {
    const main = document.querySelector<HTMLElement>(".cinematic-home");
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-story-section]"));
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (!main || sections.length === 0 || motionPreference.matches) return;

    const nav = document.querySelector<HTMLElement>(".cinematic-nav");
    const brand = nav?.querySelector<HTMLAnchorElement>(".cinematic-brand") ?? null;
    const navLinks = nav?.querySelector<HTMLElement>(".cinematic-links") ?? null;

    sections.forEach((section, index) => {
      if (!section.id && chapters[index]) section.id = chapters[index].id;
      section.dataset.scrollState = "incoming";
    });
    main.classList.add("scroll-directed");

    let frame = 0;
    let measurements: SectionMeasurement[] = [];
    let viewportHeight = Math.max(window.innerHeight, 1);
    let isMobile = window.innerWidth <= 680;
    let pageRange = 1;

    const clearTopNavState = () => {
      brand?.classList.remove("is-section-current");
      brand?.removeAttribute("aria-current");
      brand?.removeAttribute("data-gwap-chapter-readout");
      navLinks?.querySelectorAll<HTMLAnchorElement>("a.is-section-current").forEach((link) => {
        link.classList.remove("is-section-current");
        link.removeAttribute("aria-current");
      });
    };

    const syncTopNavState = (chapterIndex: number, emitEvent = true) => {
      const chapter = chapters[chapterIndex];
      if (!chapter) return;

      clearTopNavState();
      document.documentElement.dataset.gwapChapter = chapter.id;

      if (nav) nav.dataset.gwapChapter = chapter.id;
      if (brand) {
        brand.dataset.gwapChapterReadout = `${String(chapterIndex + 1).padStart(2, "0")} / ${chapter.label.toUpperCase()}`;
        brand.classList.toggle("is-section-current", chapter.id === "top" || chapter.id === "overview");
        if (chapter.id === "top") brand.setAttribute("aria-current", "location");
      }

      const selector = chapterNavSelectors[chapter.id];
      const activeLink = selector ? nav?.querySelector<HTMLAnchorElement>(selector) ?? null : null;

      if (activeLink) {
        activeLink.classList.add("is-section-current");
        if (activeLink.getAttribute("href")?.startsWith("#")) {
          activeLink.setAttribute("aria-current", "location");
        }
      }

      if (navLinks && activeLink) {
        const linksRect = navLinks.getBoundingClientRect();
        const linkRect = activeLink.getBoundingClientRect();
        navLinks.style.setProperty("--gwap-nav-lens-x", `${Math.max(linkRect.left - linksRect.left, 0)}px`);
        navLinks.style.setProperty("--gwap-nav-lens-width", `${linkRect.width}px`);
        navLinks.style.setProperty("--gwap-nav-lens-opacity", "1");
      } else {
        navLinks?.style.setProperty("--gwap-nav-lens-opacity", "0");
      }

      if (emitEvent) {
        window.dispatchEvent(new CustomEvent("gwap:chapterchange", {
          detail: { id: chapter.id, index: chapterIndex, label: chapter.label },
        }));
      }
    };

    const measure = () => {
      viewportHeight = Math.max(window.innerHeight, 1);
      isMobile = window.innerWidth <= 680;
      pageRange = Math.max(document.documentElement.scrollHeight - viewportHeight, 1);
      const scrollY = window.scrollY;
      measurements = sections.map((section) => {
        const rect = section.getBoundingClientRect();
        return { top: rect.top + scrollY, bottom: rect.bottom + scrollY };
      });
    };

    const update = () => {
      const scrollY = window.scrollY;
      const focusLine = scrollY + viewportHeight * 0.52;
      const chapterProgress = getContinuousChapterProgress(focusLine, measurements);
      const navRect = nav?.getBoundingClientRect();

      document.documentElement.style.setProperty(
        "--page-scroll-progress",
        String(clamp(scrollY / pageRange, 0, 1)),
      );
      document.documentElement.style.setProperty("--gwap-chapter-progress", chapterProgress.toFixed(4));
      document.documentElement.style.setProperty("--gwap-chapter-position", `${(chapterProgress * 100).toFixed(3)}%`);

      if (nav && navRect) {
        const trackWidth = Math.max(navRect.width - 36, 0);
        nav.style.setProperty("--gwap-nav-beacon-x", `${18 + chapterProgress * trackWidth}px`);
      }

      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      measurements.forEach(({ top, bottom }, index) => {
        const section = sections[index];
        let distance = 0;
        if (top > focusLine) distance = (top - focusLine) / viewportHeight;
        else if (bottom < focusLine) distance = (bottom - focusLine) / viewportHeight;

        const absoluteDistance = Math.abs(distance);
        if (absoluteDistance < nearestDistance) {
          nearestDistance = absoluteDistance;
          nearestIndex = index;
        }

        const focus = smoothstep(1 - clamp(absoluteDistance / 0.68, 0, 1));
        const incoming = distance > 0;
        const unfocused = 1 - focus;
        const scale = isMobile ? 0.93 + focus * 0.07 : incoming ? 0.78 + focus * 0.22 : 1 + unfocused * 0.12;
        const z = isMobile ? -110 * unfocused : incoming ? -340 * unfocused : 160 * unfocused;
        const y = clamp(distance * (isMobile ? 40 : 96), isMobile ? -42 : -105, isMobile ? 42 : 105);
        const blur = (isMobile ? 8 : 24) * unfocused;
        const opacity = (isMobile ? 0.42 : 0.05) + focus * (isMobile ? 0.58 : 0.95);
        const rotate = isMobile ? 0 : incoming ? 4 * unfocused : -2.2 * unfocused;

        section.style.cssText += `;--story-focus:${focus.toFixed(4)};--story-opacity:${opacity.toFixed(4)};--story-scale:${scale.toFixed(4)};--story-z:${z.toFixed(2)}px;--story-y:${y.toFixed(2)}px;--story-blur:${blur.toFixed(2)}px;--story-rotate:${rotate.toFixed(2)}deg;--story-veil:${unfocused.toFixed(4)}`;
        section.dataset.scrollState = incoming ? "incoming" : distance < 0 ? "past" : "active";
      });

      sections.forEach((section, index) => section.classList.toggle("is-scroll-active", index === nearestIndex));
      if (activeChapterRef.current !== nearestIndex) {
        activeChapterRef.current = nearestIndex;
        syncTopNavState(nearestIndex);
        setActiveChapter(nearestIndex);
      }
      frame = 0;
    };

    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const handleResize = () => {
      measure();
      syncTopNavState(Math.max(activeChapterRef.current, 0), false);
      scheduleUpdate();
    };

    measure();
    update();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", handleResize);
      window.cancelAnimationFrame(frame);
      main.classList.remove("scroll-directed");
      document.documentElement.style.removeProperty("--page-scroll-progress");
      document.documentElement.style.removeProperty("--gwap-chapter-progress");
      document.documentElement.style.removeProperty("--gwap-chapter-position");
      delete document.documentElement.dataset.gwapChapter;
      if (nav) {
        nav.style.removeProperty("--gwap-nav-beacon-x");
        delete nav.dataset.gwapChapter;
      }
      navLinks?.style.removeProperty("--gwap-nav-lens-x");
      navLinks?.style.removeProperty("--gwap-nav-lens-width");
      navLinks?.style.removeProperty("--gwap-nav-lens-opacity");
      clearTopNavState();
      sections.forEach((section) => {
        section.classList.remove("is-scroll-active");
        delete section.dataset.scrollState;
        ["--story-focus", "--story-opacity", "--story-scale", "--story-z", "--story-y", "--story-blur", "--story-rotate", "--story-veil"].forEach((property) => section.style.removeProperty(property));
      });
    };
  }, []);

  return (
    <aside className="story-chapters" aria-label="Page chapters">
      <span className="story-progress-track" aria-hidden="true"><i /></span>
      <nav>
        {chapters.map((chapter, index) => (
          <a className={index === activeChapter ? "is-current" : undefined} href={`#${chapter.id}`} aria-current={index === activeChapter ? "step" : undefined} key={chapter.id}>
            <span>{String(index + 1).padStart(2, "0")}</span><b>{chapter.label}</b>
          </a>
        ))}
      </nav>
    </aside>
  );
}
