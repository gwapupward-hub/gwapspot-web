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

const lerp = (current: number, target: number, amount: number) =>
  current + (target - current) * amount;

const smoothstep = (value: number) => value * value * (3 - 2 * value);

type MotionState = {
  focus: number;
  opacity: number;
  scale: number;
  z: number;
  y: number;
  blur: number;
  rotate: number;
  veil: number;
};

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
    let pageProgress = 0;
    let targetPageProgress = 0;
    let nearestIndex = 0;
    let needsMeasurement = true;

    const currentStates: MotionState[] = sections.map(() => ({
      focus: 0,
      opacity: 0,
      scale: 0.82,
      z: -300,
      y: 80,
      blur: 22,
      rotate: 3,
      veil: 1,
    }));

    const targetStates: MotionState[] = currentStates.map((state) => ({ ...state }));

    const measure = () => {
      const viewportHeight = Math.max(window.innerHeight, 1);
      const focusLine = viewportHeight * 0.52;
      const isMobile = window.innerWidth <= 680;
      const pageRange = Math.max(
        document.documentElement.scrollHeight - viewportHeight,
        1,
      );

      targetPageProgress = clamp(window.scrollY / pageRange, 0, 1);

      let closestIndex = 0;
      let closestDistance = Number.POSITIVE_INFINITY;

      sections.forEach((section, index) => {
        const rect = section.getBoundingClientRect();
        let distance = 0;

        if (rect.top > focusLine) {
          distance = (rect.top - focusLine) / viewportHeight;
        } else if (rect.bottom < focusLine) {
          distance = (rect.bottom - focusLine) / viewportHeight;
        }

        const absoluteDistance = Math.abs(distance);
        if (absoluteDistance < closestDistance) {
          closestDistance = absoluteDistance;
          closestIndex = index;
        }

        const normalizedDistance = clamp(absoluteDistance / 0.82, 0, 1);
        const focus = smoothstep(1 - normalizedDistance);
        const incoming = distance > 0;
        const outgoing = distance < 0;
        const unfocused = 1 - focus;

        targetStates[index] = {
          focus,
          opacity:
            (isMobile ? 0.46 : 0.08) + focus * (isMobile ? 0.54 : 0.92),
          scale: isMobile
            ? 0.94 + focus * 0.06
            : incoming
              ? 0.8 + focus * 0.2
              : 1 + unfocused * 0.1,
          z: isMobile
            ? -95 * unfocused
            : incoming
              ? -320 * unfocused
              : 145 * unfocused,
          y: clamp(
            distance * (isMobile ? 34 : 82),
            isMobile ? -36 : -92,
            isMobile ? 36 : 92,
          ),
          blur: (isMobile ? 7 : 21) * unfocused,
          rotate: isMobile
            ? 0
            : incoming
              ? 3.5 * unfocused
              : -2 * unfocused,
          veil: unfocused,
        };

        section.dataset.scrollState = incoming
          ? "incoming"
          : outgoing
            ? "past"
            : "active";
      });

      nearestIndex = closestIndex;
      needsMeasurement = false;
    };

    const render = () => {
      if (needsMeasurement) measure();

      const isMobile = window.innerWidth <= 680;
      const damping = isMobile ? 0.075 : 0.065;
      let stillMoving = false;

      pageProgress = lerp(pageProgress, targetPageProgress, damping);
      document.documentElement.style.setProperty(
        "--page-scroll-progress",
        pageProgress.toFixed(5),
      );

      sections.forEach((section, index) => {
        const current = currentStates[index];
        const target = targetStates[index];

        current.focus = lerp(current.focus, target.focus, damping);
        current.opacity = lerp(current.opacity, target.opacity, damping);
        current.scale = lerp(current.scale, target.scale, damping);
        current.z = lerp(current.z, target.z, damping);
        current.y = lerp(current.y, target.y, damping);
        current.blur = lerp(current.blur, target.blur, damping);
        current.rotate = lerp(current.rotate, target.rotate, damping);
        current.veil = lerp(current.veil, target.veil, damping);

        section.style.setProperty("--story-focus", current.focus.toFixed(4));
        section.style.setProperty("--story-opacity", current.opacity.toFixed(4));
        section.style.setProperty("--story-scale", current.scale.toFixed(4));
        section.style.setProperty("--story-z", `${current.z.toFixed(2)}px`);
        section.style.setProperty("--story-y", `${current.y.toFixed(2)}px`);
        section.style.setProperty("--story-blur", `${current.blur.toFixed(2)}px`);
        section.style.setProperty("--story-rotate", `${current.rotate.toFixed(2)}deg`);
        section.style.setProperty("--story-veil", current.veil.toFixed(4));

        if (
          Math.abs(current.scale - target.scale) > 0.0005 ||
          Math.abs(current.opacity - target.opacity) > 0.001 ||
          Math.abs(current.y - target.y) > 0.08 ||
          Math.abs(current.z - target.z) > 0.08 ||
          Math.abs(current.blur - target.blur) > 0.04
        ) {
          stillMoving = true;
        }
      });

      sections.forEach((section, index) => {
        section.classList.toggle("is-scroll-active", index === nearestIndex);
      });

      if (activeChapterRef.current !== nearestIndex) {
        activeChapterRef.current = nearestIndex;
        setActiveChapter(nearestIndex);
      }

      if (
        stillMoving ||
        Math.abs(pageProgress - targetPageProgress) > 0.0002 ||
        needsMeasurement
      ) {
        frame = window.requestAnimationFrame(render);
      } else {
        frame = 0;
      }
    };

    const scheduleUpdate = () => {
      needsMeasurement = true;
      if (!frame) frame = window.requestAnimationFrame(render);
    };

    measure();
    frame = window.requestAnimationFrame(render);
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
