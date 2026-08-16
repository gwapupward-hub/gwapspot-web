"use client";

import { useEffect, useState } from "react";

export function BackToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("top");
    if (!hero) return;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      {
        rootMargin: "-18% 0px 0px 0px",
        threshold: 0.02,
      },
    );

    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  const returnToTop = () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("top")?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
  };

  return (
    <button
      className={`gwap-back-to-top${visible ? " is-visible" : ""}`}
      type="button"
      aria-label="Back to top"
      onClick={returnToTop}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="m6 11 6-6 6 6" />
        <path d="M12 5v14" />
      </svg>
      <span>TOP</span>
    </button>
  );
}
