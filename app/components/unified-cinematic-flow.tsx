"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

const chapters = [
  { id: "top", label: "Intro" },
  { id: "overview", label: "System" },
  { id: "ecosystem", label: "Ecosystem" },
  { id: "trust", label: "Trust" },
  { id: "roadmap", label: "Roadmap" },
  { id: "community", label: "Community" },
] as const;

const ENTRY_DURATION_MS = 520;

export function UnifiedCinematicFlow() {
  const [visualsEnabled, setVisualsEnabled] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const seenChaptersRef = useRef(new Set<number>());

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const main = document.querySelector<HTMLElement>(".cinematic-home");
    const sections = chapters
      .map((chapter) => document.getElementById(chapter.id))
      .filter((section): section is HTMLElement => Boolean(section));

    if (!main || sections.length === 0) return;

    let observer: IntersectionObserver | null = null;
    let evaluationFrame = 0;
    const entryTimers = new Map<HTMLElement, number>();

    const clearEntryTimer = (section: HTMLElement) => {
      const timer = entryTimers.get(section);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        entryTimers.delete(section);
      }
    };

    const clearClasses = () => {
      sections.forEach((section) => {
        clearEntryTimer(section);
        section.classList.remove(
          "gwap-unified-active",
          "gwap-unified-past",
          "gwap-unified-entering",
        );
      });
      seenChaptersRef.current.clear();
      delete document.documentElement.dataset.gwapChapter;
    };

    const activate = (index: number, animateEntry = true) => {
      if (index < 0 || index >= sections.length) return;
      if (
        index === activeIndexRef.current &&
        sections[index]?.classList.contains("gwap-unified-active")
      ) {
        return;
      }

      const firstVisit = !seenChaptersRef.current.has(index);
      activeIndexRef.current = index;
      setActiveIndex(index);
      document.documentElement.dataset.gwapChapter = chapters[index]?.id ?? "top";

      sections.forEach((section, sectionIndex) => {
        const isActive = sectionIndex === index;
        section.classList.toggle("gwap-unified-active", isActive);
        section.classList.toggle("gwap-unified-past", sectionIndex < index);

        if (!isActive) {
          clearEntryTimer(section);
          section.classList.remove("gwap-unified-entering");
        }
      });

      const activeSection = sections[index];
      if (activeSection && firstVisit && animateEntry && !reduceMotion.matches) {
        activeSection.classList.add("gwap-unified-entering");
        clearEntryTimer(activeSection);
        const timer = window.setTimeout(() => {
          activeSection.classList.remove("gwap-unified-entering");
          entryTimers.delete(activeSection);
        }, ENTRY_DURATION_MS);
        entryTimers.set(activeSection, timer);
      }

      seenChaptersRef.current.add(index);
      window.dispatchEvent(
        new CustomEvent("gwap:chapterchange", {
          detail: { id: chapters[index]?.id ?? "top", index },
        }),
      );
    };

    const findChapterAtFocusLine = () => {
      const focusLine = Math.max(window.innerHeight, 1) * 0.46;
      let nearestIndex = activeIndexRef.current;
      let nearestDistance = Number.POSITIVE_INFINITY;

      sections.forEach((section, index) => {
        const rect = section.getBoundingClientRect();
        let distance = 0;

        if (rect.top > focusLine) distance = rect.top - focusLine;
        else if (rect.bottom < focusLine) distance = focusLine - rect.bottom;

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      return nearestIndex;
    };

    const hashChapterIndex = () => {
      const id = window.location.hash.replace(/^#/, "");
      return chapters.findIndex((chapter) => chapter.id === id);
    };

    const evaluateChapter = () => {
      evaluationFrame = 0;
      const nextIndex = findChapterAtFocusLine();
      if (nextIndex !== activeIndexRef.current) activate(nextIndex);
    };

    const scheduleEvaluation = () => {
      if (document.hidden || evaluationFrame) return;
      evaluationFrame = window.requestAnimationFrame(evaluateChapter);
    };

    const teardownObserver = () => {
      observer?.disconnect();
      observer = null;
      if (evaluationFrame) {
        window.cancelAnimationFrame(evaluationFrame);
        evaluationFrame = 0;
      }
    };

    const configure = () => {
      teardownObserver();
      clearClasses();
      main.classList.add("unified-cinematic-flow");
      setVisualsEnabled(!reduceMotion.matches);

      const hashedIndex = hashChapterIndex();
      const initialIndex = hashedIndex >= 0 ? hashedIndex : findChapterAtFocusLine();
      activeIndexRef.current = -1;
      activate(initialIndex, false);

      observer = new IntersectionObserver(scheduleEvaluation, {
        rootMargin: "-38% 0px -38% 0px",
        threshold: [0.01, 0.35],
      });

      sections.forEach((section) => observer?.observe(section));
    };

    const handleResize = () => scheduleEvaluation();
    const handleVisibilityChange = () => {
      if (!document.hidden) scheduleEvaluation();
    };
    const handleHashChange = () => {
      const index = hashChapterIndex();
      if (index >= 0) activate(index, false);
      scheduleEvaluation();
    };

    configure();
    reduceMotion.addEventListener("change", configure);
    window.addEventListener("resize", handleResize, { passive: true });
    window.addEventListener("hashchange", handleHashChange, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      teardownObserver();
      reduceMotion.removeEventListener("change", configure);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("hashchange", handleHashChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearClasses();
      main.classList.remove("unified-cinematic-flow");
    };
  }, []);

  if (!visualsEnabled) return null;

  const chapter = chapters[activeIndex] ?? chapters[0];
  const progress = chapters.length > 1 ? activeIndex / (chapters.length - 1) : 0;
  const railStyle = { "--gwap-unified-progress": progress } as CSSProperties;
  const dotStyle = {
    transform: `translate3d(0, ${Math.round(progress * 76)}px, 0)`,
  } as CSSProperties;

  return (
    <aside
      className={`gwap-unified-cinematic is-${chapter.id}`}
      aria-hidden="true"
      style={railStyle}
    >
      <div className="gwap-unified-cinematic__accent" />
      <div className="gwap-unified-cinematic__rail">
        <span className="gwap-unified-cinematic__index" key={`index-${chapter.id}`}>
          {String(activeIndex + 1).padStart(2, "0")}
        </span>
        <span className="gwap-unified-cinematic__track">
          <i />
          <b style={dotStyle} />
        </span>
        <strong className="gwap-unified-cinematic__label" key={`label-${chapter.id}`}>
          {chapter.label}
        </strong>
      </div>
    </aside>
  );
}
