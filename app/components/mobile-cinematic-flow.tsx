"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

const mobileChapters = [
  { id: "top", label: "Intro" },
  { id: "overview", label: "System" },
  { id: "ecosystem", label: "Ecosystem" },
  { id: "trust", label: "Trust" },
  { id: "roadmap", label: "Roadmap" },
  { id: "community", label: "Community" },
] as const;

const MOBILE_CINEMATIC_QUERY = "(hover: none) and (pointer: coarse), (max-width: 820px)";
const ENTRY_DURATION_MS = 620;

export function MobileCinematicFlow() {
  const [enabled, setEnabled] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const seenChaptersRef = useRef(new Set<number>());

  useEffect(() => {
    const mobile = window.matchMedia(MOBILE_CINEMATIC_QUERY);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const main = document.querySelector<HTMLElement>(".cinematic-home");
    const sections = mobileChapters
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
      main.classList.remove("mobile-cinematic-flow");
      sections.forEach((section) => {
        clearEntryTimer(section);
        section.classList.remove("gwap-mobile-active", "gwap-mobile-past", "gwap-mobile-entering");
      });
      seenChaptersRef.current.clear();
      delete document.documentElement.dataset.gwapMobileChapter;
    };

    const activate = (index: number, animateEntry = true) => {
      if (index < 0 || index >= sections.length || index === activeIndexRef.current && sections[index]?.classList.contains("gwap-mobile-active")) return;

      const firstVisit = !seenChaptersRef.current.has(index);
      activeIndexRef.current = index;
      setActiveIndex(index);
      document.documentElement.dataset.gwapMobileChapter = mobileChapters[index]?.id ?? "top";

      sections.forEach((section, sectionIndex) => {
        const isActive = sectionIndex === index;
        section.classList.toggle("gwap-mobile-active", isActive);
        section.classList.toggle("gwap-mobile-past", sectionIndex < index);

        if (!isActive) {
          clearEntryTimer(section);
          section.classList.remove("gwap-mobile-entering");
        }
      });

      const activeSection = sections[index];
      if (activeSection && firstVisit && animateEntry) {
        activeSection.classList.add("gwap-mobile-entering");
        clearEntryTimer(activeSection);
        const timer = window.setTimeout(() => {
          activeSection.classList.remove("gwap-mobile-entering");
          entryTimers.delete(activeSection);
        }, ENTRY_DURATION_MS);
        entryTimers.set(activeSection, timer);
      }

      seenChaptersRef.current.add(index);
      window.dispatchEvent(
        new CustomEvent("gwap:mobilechapterchange", {
          detail: { id: mobileChapters[index]?.id ?? "top", index },
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

      const shouldEnable = mobile.matches && !reduceMotion.matches;
      setEnabled(shouldEnable);
      if (!shouldEnable) return;

      main.classList.add("mobile-cinematic-flow");
      const initialIndex = findChapterAtFocusLine();
      activeIndexRef.current = -1;
      activate(initialIndex, false);

      observer = new IntersectionObserver(
        scheduleEvaluation,
        {
          rootMargin: "-38% 0px -38% 0px",
          threshold: [0.01, 0.35],
        },
      );

      sections.forEach((section) => observer?.observe(section));
    };

    const handleResize = () => scheduleEvaluation();
    const handleVisibilityChange = () => {
      if (!document.hidden) scheduleEvaluation();
    };

    configure();
    mobile.addEventListener("change", configure);
    reduceMotion.addEventListener("change", configure);
    window.addEventListener("resize", handleResize, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      teardownObserver();
      mobile.removeEventListener("change", configure);
      reduceMotion.removeEventListener("change", configure);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearClasses();
    };
  }, []);

  if (!enabled) return null;

  const chapter = mobileChapters[activeIndex] ?? mobileChapters[0];
  const progress = mobileChapters.length > 1 ? activeIndex / (mobileChapters.length - 1) : 0;
  const railStyle = { "--gwap-mobile-progress": progress } as CSSProperties;
  const dotStyle = { transform: `translate3d(0, ${Math.round(progress * 76)}px, 0)` } as CSSProperties;

  return (
    <aside className={`gwap-mobile-cinematic is-${chapter.id}`} aria-hidden="true" style={railStyle}>
      <div className="gwap-mobile-cinematic__orb" />
      <div className="gwap-mobile-cinematic__pulse" key={`pulse-${chapter.id}`} />
      <div className="gwap-mobile-cinematic__rail">
        <span className="gwap-mobile-cinematic__index" key={`index-${chapter.id}`}>
          {String(activeIndex + 1).padStart(2, "0")}
        </span>
        <span className="gwap-mobile-cinematic__track">
          <i />
          <b style={dotStyle} />
        </span>
        <strong className="gwap-mobile-cinematic__label" key={`label-${chapter.id}`}>{chapter.label}</strong>
      </div>
    </aside>
  );
}
