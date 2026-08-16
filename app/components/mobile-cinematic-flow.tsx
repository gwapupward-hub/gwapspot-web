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

export function MobileCinematicFlow() {
  const [enabled, setEnabled] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);

  useEffect(() => {
    const mobile = window.matchMedia(MOBILE_CINEMATIC_QUERY);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const main = document.querySelector<HTMLElement>(".cinematic-home");
    const sections = mobileChapters
      .map((chapter) => document.getElementById(chapter.id))
      .filter((section): section is HTMLElement => Boolean(section));

    if (!main || sections.length === 0) return;

    let observer: IntersectionObserver | null = null;

    const clearClasses = () => {
      main.classList.remove("mobile-cinematic-flow");
      sections.forEach((section) => {
        section.classList.remove("gwap-mobile-active", "gwap-mobile-past");
      });
      delete document.documentElement.dataset.gwapMobileChapter;
    };

    const activate = (index: number) => {
      if (index < 0 || index >= sections.length) return;
      activeIndexRef.current = index;
      setActiveIndex(index);
      document.documentElement.dataset.gwapMobileChapter = mobileChapters[index]?.id ?? "top";

      sections.forEach((section, sectionIndex) => {
        section.classList.toggle("gwap-mobile-active", sectionIndex === index);
        section.classList.toggle("gwap-mobile-past", sectionIndex < index);
      });
    };

    const findInitialChapter = () => {
      const focusLine = Math.max(window.innerHeight, 1) * 0.48;
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      sections.forEach((section, index) => {
        const rect = section.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const distance = Math.abs(center - focusLine);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      return nearestIndex;
    };

    const teardownObserver = () => {
      observer?.disconnect();
      observer = null;
    };

    const configure = () => {
      teardownObserver();
      clearClasses();

      const shouldEnable = mobile.matches && !reduceMotion.matches;
      setEnabled(shouldEnable);
      if (!shouldEnable) return;

      main.classList.add("mobile-cinematic-flow");
      activate(findInitialChapter());

      observer = new IntersectionObserver(
        (entries) => {
          const visible = entries.filter((entry) => entry.isIntersecting);
          if (visible.length === 0) return;

          const focusLine = Math.max(window.innerHeight, 1) * 0.46;
          const nearest = visible.reduce((best, entry) => {
            const center = entry.boundingClientRect.top + entry.boundingClientRect.height / 2;
            const distance = Math.abs(center - focusLine);
            return distance < best.distance ? { entry, distance } : best;
          }, { entry: visible[0], distance: Number.POSITIVE_INFINITY });

          const index = sections.indexOf(nearest.entry.target as HTMLElement);
          if (index !== -1 && index !== activeIndexRef.current) activate(index);
        },
        {
          rootMargin: "-18% 0px -34% 0px",
          threshold: [0.01, 0.18, 0.42],
        },
      );

      sections.forEach((section) => observer?.observe(section));
    };

    configure();
    mobile.addEventListener("change", configure);
    reduceMotion.addEventListener("change", configure);

    return () => {
      teardownObserver();
      mobile.removeEventListener("change", configure);
      reduceMotion.removeEventListener("change", configure);
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
