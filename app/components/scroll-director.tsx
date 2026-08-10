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
type ScrollState = "incoming" | "past" | "active";

const chapterNavSelectors: Partial<Record<ChapterId, string>> = {
  ecosystem: '.cinematic-links a[href="#ecosystem"]',
  trust: '.cinematic-links a[href="#trust"]',
  roadmap: '.cinematic-links a[href="#roadmap"]',
  community: '.cinematic-links a[href="/community"]',
};

const storyProperties = [
  "--story-focus",
  "--story-opacity",
  "--story-scale",
  "--story-z",
  "--story-y",
  "--story-blur",
  "--story-rotate",
  "--story-veil",
] as const;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);
const smoothstep = (value: number) => value * value * (3 - 2 * value);

function setCssVariable(element: HTMLElement, property: string, value: string) {
  if (element.style.getPropertyValue(property) !== value) {
    element.style.setProperty(property, value);
  }
}

function setScrollState(section: HTMLElement, state: ScrollState) {
  if (section.dataset.scrollState !== state) section.dataset.scrollState = state;
}

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
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const activeChapterRef = useRef(-1);

  useEffect(() => {
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const touchPerformanceMode = window.matchMedia("(hover: none) and (pointer: coarse)");
    const narrowPerformanceMode = window.matchMedia("(max-width: 820px)");
    const syncPreference = () =>
      setReduceMotion(
        motionPreference.matches ||
        touchPerformanceMode.matches ||
        narrowPerformanceMode.matches,
      );

    syncPreference();
    motionPreference.addEventListener("change", syncPreference);
    touchPerformanceMode.addEventListener("change", syncPreference);
    narrowPerformanceMode.addEventListener("change", syncPreference);
    return () => {
      motionPreference.removeEventListener("change", syncPreference);
      touchPerformanceMode.removeEventListener("change", syncPreference);
      narrowPerformanceMode.removeEventListener("change", syncPreference);
    };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return;

    const main = document.querySelector<HTMLElement>(".cinematic-home");
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-story-section]"));
    if (!main || sections.length === 0) return;

    const root = document.documentElement;
    const nav = document.querySelector<HTMLElement>(".cinematic-nav");
    const brand = nav?.querySelector<HTMLAnchorElement>(".cinematic-brand") ?? null;
    const navLinks = nav?.querySelector<HTMLElement>(".cinematic-links") ?? null;

    sections.forEach((section, index) => {
      if (!section.id && chapters[index]) section.id = chapters[index].id;
      setScrollState(section, "incoming");
    });

    main.classList.toggle("scroll-directed", !reduceMotion);
    if (reduceMotion) {
      root.style.removeProperty("--page-scroll-progress");
      root.style.removeProperty("--gwap-chapter-progress");
      root.style.removeProperty("--gwap-chapter-position");
      nav?.style.removeProperty("--gwap-nav-beacon-x");
    }

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
      root.dataset.gwapChapter = chapter.id;

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

      if (!reduceMotion && navLinks && activeLink) {
        const linksRect = navLinks.getBoundingClientRect();
        const linkRect = activeLink.getBoundingClientRect();
        setCssVariable(navLinks, "--gwap-nav-lens-x", `${Math.max(linkRect.left - linksRect.left, 0)}px`);
        setCssVariable(navLinks, "--gwap-nav-lens-width", `${linkRect.width}px`);
        setCssVariable(navLinks, "--gwap-nav-lens-opacity", "1");
      } else if (navLinks) {
        setCssVariable(navLinks, "--gwap-nav-lens-opacity", "0");
      }

      if (emitEvent) {
        window.dispatchEvent(
          new CustomEvent("gwap:chapterchange", {
            detail: { id: chapter.id, index: chapterIndex, label: chapter.label },
          }),
        );
      }
    };

    const measure = () => {
      viewportHeight = Math.max(window.innerHeight, 1);
      isMobile = window.innerWidth <= 680;
      pageRange = Math.max(root.scrollHeight - viewportHeight, 1);
      const scrollY = window.scrollY;
      measurements = sections.map((section) => {
        const rect = section.getBoundingClientRect();
        return { top: rect.top + scrollY, bottom: rect.bottom + scrollY };
      });
    };

    const update = () => {
      const scrollY = window.scrollY;
      const focusLine = scrollY + viewportHeight * 0.52;

      if (!reduceMotion) {
        const chapterProgress = getContinuousChapterProgress(focusLine, measurements);
        setCssVariable(root, "--page-scroll-progress", String(clamp(scrollY / pageRange, 0, 1)));
        setCssVariable(root, "--gwap-chapter-progress", chapterProgress.toFixed(4));
        setCssVariable(root, "--gwap-chapter-position", `${(chapterProgress * 100).toFixed(3)}%`);

        if (nav) {
          const navRect = nav.getBoundingClientRect();
          const trackWidth = Math.max(navRect.width - 36, 0);
          setCssVariable(nav, "--gwap-nav-beacon-x", `${18 + chapterProgress * trackWidth}px`);
        }
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

        const state: ScrollState = distance > 0 ? "incoming" : distance < 0 ? "past" : "active";
        setScrollState(section, state);

        if (reduceMotion) return;

        const focus = smoothstep(1 - clamp(absoluteDistance / 0.68, 0, 1));
        const incoming = distance > 0;
        const unfocused = 1 - focus;
        const scale = isMobile ? 0.93 + focus * 0.07 : incoming ? 0.78 + focus * 0.22 : 1 + unfocused * 0.12;
        const z = isMobile ? -110 * unfocused : incoming ? -340 * unfocused : 160 * unfocused;
        const y = clamp(distance * (isMobile ? 40 : 96), isMobile ? -42 : -105, isMobile ? 42 : 105);
        const blur = (isMobile ? 8 : 24) * unfocused;
        const opacity = (isMobile ? 0.42 : 0.05) + focus * (isMobile ? 0.58 : 0.95);
        const rotate = isMobile ? 0 : incoming ? 4 * unfocused : -2.2 * unfocused;

        setCssVariable(section, "--story-focus", focus.toFixed(4));
        setCssVariable(section, "--story-opacity", opacity.toFixed(4));
        setCssVariable(section, "--story-scale", scale.toFixed(4));
        setCssVariable(section, "--story-z", `${z.toFixed(2)}px`);
        setCssVariable(section, "--story-y", `${y.toFixed(2)}px`);
        setCssVariable(section, "--story-blur", `${blur.toFixed(2)}px`);
        setCssVariable(section, "--story-rotate", `${rotate.toFixed(2)}deg`);
        setCssVariable(section, "--story-veil", unfocused.toFixed(4));
      });

      if (activeChapterRef.current !== nearestIndex) {
        if (activeChapterRef.current >= 0) {
          sections[activeChapterRef.current]?.classList.remove("is-scroll-active");
        }
        sections[nearestIndex]?.classList.add("is-scroll-active");
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

    activeChapterRef.current = -1;
    measure();
    update();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", handleResize);
      window.cancelAnimationFrame(frame);
      main.classList.remove("scroll-directed");
      root.style.removeProperty("--page-scroll-progress");
      root.style.removeProperty("--gwap-chapter-progress");
      root.style.removeProperty("--gwap-chapter-position");
      delete root.dataset.gwapChapter;
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
        storyProperties.forEach((property) => section.style.removeProperty(property));
      });
      activeChapterRef.current = -1;
    };
  }, [reduceMotion]);

  return (
    <aside className="story-chapters" aria-label="Page chapters">
      <span className="story-progress-track" aria-hidden="true"><i /></span>
      <nav>
        {chapters.map((chapter, index) => (
          <a
            className={index === activeChapter ? "is-current" : undefined}
            href={`#${chapter.id}`}
            aria-current={index === activeChapter ? "location" : undefined}
            key={chapter.id}
          >
            <span>{String(index + 1).padStart(2, "0")}</span><b>{chapter.label}</b>
          </a>
        ))}
      </nav>
    </aside>
  );
}
