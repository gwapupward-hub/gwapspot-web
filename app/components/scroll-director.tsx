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

export function ScrollDirector() {
  const [activeChapter, setActiveChapter] = useState(0);
  const activeChapterRef = useRef(0);

  useEffect(() => {
    const main = document.querySelector<HTMLElement>(".cinematic-home");
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-story-section]"),
    );
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (!main || sections.length === 0 || motionPreference.matches) return;

    sections.forEach((section, index) => {
      if (!section.id && chapters[index]) section.id = chapters[index].id;
      section.dataset.scrollState = "incoming";
    });
    main.classList.add("scroll-directed");

    let frame = 0;

    const update = () => {
      const viewportHeight = Math.max(window.innerHeight, 1);
      const focusLine = viewportHeight * 0.52;
      const isMobile = window.innerWidth <= 680;
      const pageRange = Math.max(
        document.documentElement.scrollHeight - viewportHeight,
        1,
      );

      document.documentElement.style.setProperty(
        "--page-scroll-progress",
        String(clamp(window.scrollY / pageRange, 0, 1)),
      );

      const measurements = sections.map((section) => {
        const rect = section.getBoundingClientRect();
        let distance = 0;

        if (rect.top > focusLine) {
          distance = (rect.top - focusLine) / viewportHeight;
        } else if (rect.bottom < focusLine) {
          distance = (rect.bottom - focusLine) / viewportHeight;
        }

        return { section, distance, absoluteDistance: Math.abs(distance) };
      });

      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      measurements.forEach(({ section, distance, absoluteDistance }, index) => {
        if (absoluteDistance < nearestDistance) {
          nearestDistance = absoluteDistance;
          nearestIndex = index;
        }

        const normalizedDistance = clamp(absoluteDistance / 0.68, 0, 1);
        const focus = smoothstep(1 - normalizedDistance);
        const incoming = distance > 0;
        const outgoing = distance < 0;
        const unfocused = 1 - focus;

        const scale = isMobile
          ? 0.93 + focus * 0.07
          : incoming
            ? 0.78 + focus * 0.22
            : 1 + unfocused * 0.12;
        const z = isMobile
          ? -110 * unfocused
          : incoming
            ? -340 * unfocused
            : 160 * unfocused;
        const y = clamp(
          distance * (isMobile ? 40 : 96),
          isMobile ? -42 : -105,
          isMobile ? 42 : 105,
        );
        const blur = (isMobile ? 8 : 24) * unfocused;
        const opacity = (isMobile ? 0.42 : 0.05) + focus * (isMobile ? 0.58 : 0.95);
        const rotate = isMobile
          ? 0
          : incoming
            ? 4 * unfocused
            : -2.2 * unfocused;

        section.style.setProperty("--story-focus", focus.toFixed(4));
        section.style.setProperty("--story-opacity", opacity.toFixed(4));
        section.style.setProperty("--story-scale", scale.toFixed(4));
        section.style.setProperty("--story-z", `${z.toFixed(2)}px`);
        section.style.setProperty("--story-y", `${y.toFixed(2)}px`);
        section.style.setProperty("--story-blur", `${blur.toFixed(2)}px`);
        section.style.setProperty("--story-rotate", `${rotate.toFixed(2)}deg`);
        section.style.setProperty("--story-veil", unfocused.toFixed(4));
        section.dataset.scrollState = incoming
          ? "incoming"
          : outgoing
            ? "past"
            : "active";
      });

      sections.forEach((section, index) => {
        section.classList.toggle("is-scroll-active", index === nearestIndex);
      });

      if (activeChapterRef.current !== nearestIndex) {
        activeChapterRef.current = nearestIndex;
        setActiveChapter(nearestIndex);
      }

      frame = 0;
    };

    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.cancelAnimationFrame(frame);
      main.classList.remove("scroll-directed");
      document.documentElement.style.removeProperty("--page-scroll-progress");
      sections.forEach((section) => {
        section.classList.remove("is-scroll-active");
        delete section.dataset.scrollState;
        [
          "--story-focus",
          "--story-opacity",
          "--story-scale",
          "--story-z",
          "--story-y",
          "--story-blur",
          "--story-rotate",
          "--story-veil",
        ].forEach((property) => section.style.removeProperty(property));
      });
    };
  }, []);

  return (
    <aside className="story-chapters" aria-label="Page chapters">
      <span className="story-progress-track" aria-hidden="true">
        <i />
      </span>
      <nav>
        {chapters.map((chapter, index) => (
          <a
            className={index === activeChapter ? "is-current" : undefined}
            href={`#${chapter.id}`}
            aria-current={index === activeChapter ? "step" : undefined}
            key={chapter.id}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <b>{chapter.label}</b>
          </a>
        ))}
      </nav>
    </aside>
  );
}
