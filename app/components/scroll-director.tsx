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

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);
const smoothstep = (value: number) => value * value * (3 - 2 * value);

type SectionMeasurement = { top: number; bottom: number };

export function ScrollDirector() {
  const [activeChapter, setActiveChapter] = useState(0);
  const activeChapterRef = useRef(0);

  useEffect(() => {
    const main = document.querySelector<HTMLElement>(".cinematic-home");
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-story-section]"));
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (!main || sections.length === 0 || motionPreference.matches) return;

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
      document.documentElement.style.setProperty(
        "--page-scroll-progress",
        String(clamp(scrollY / pageRange, 0, 1)),
      );

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
        setActiveChapter(nearestIndex);
      }
      frame = 0;
    };

    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const handleResize = () => {
      measure();
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
