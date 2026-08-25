"use client";

import { track } from "@vercel/analytics";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const CHAPTER_ENGAGEMENT_MIN_MS = 1_200;
const CHAPTER_ENGAGEMENT_CAP_MS = 120_000;

const chapters = [
  { id: "top", label: "Intro" },
  { id: "overview", label: "System" },
  { id: "ecosystem", label: "Products" },
  { id: "trust", label: "Trust" },
  { id: "roadmap", label: "Roadmap" },
  { id: "community", label: "Community" },
] as const;

const chapterById = new Map(chapters.map((chapter, index) => [chapter.id, { ...chapter, index }]));
const graphModes = new Set(["all", "identity", "trust", "commerce", "intelligence"]);
const productSlugs = new Set([
  "gns",
  "gwapscore",
  "dimi",
  "daily-ideas",
  "money-neva-sleeps",
  "marketplace",
  "occo",
  "private-proof-vault",
]);

const productHosts = new Set([
  "gwapspot.fun",
  "dimimusic.xyz",
  "slink.bigovideo.tv",
]);

const communityHosts = new Set([
  "x.com",
  "t.me",
  "github.com",
  "www.instagram.com",
  "instagram.com",
]);

type AnalyticsProperties = Record<string, string | number | boolean>;
type ActiveChapter = {
  id: string;
  index: number;
  label: string;
  startedAt: number;
};
type ChapterChangeDetail = {
  id?: string;
  index?: number;
  label?: string;
};
type ProductHandoffDetail = {
  slug?: string;
  source?: string;
  lens?: string | null;
};

function safeTrack(name: string, properties: AnalyticsProperties) {
  try {
    track(name, properties);
  } catch {
    // Analytics must never interfere with the product experience.
  }
}

function getDwellBucket(milliseconds: number) {
  if (milliseconds < 3_000) return "1-3s";
  if (milliseconds < 8_000) return "3-8s";
  if (milliseconds < 20_000) return "8-20s";
  return "20s+";
}

function getGraphModeFromButton(button: HTMLButtonElement) {
  const label = button.querySelector("em")?.textContent?.trim().toLowerCase();
  if (label === "all rails") return "all";
  return label && graphModes.has(label) ? label : null;
}

function getCurrentGraphMode() {
  const mode = document.querySelector<HTMLElement>(".gwap-graph-stage[data-graph-mode]")?.dataset.graphMode;
  return mode && graphModes.has(mode) ? mode : "all";
}

function getCurrentProductSlug(pathname: string) {
  const match = pathname.match(/^\/ecosystem\/([^/?#]+)/);
  return match?.[1] && productSlugs.has(match[1]) ? match[1] : null;
}

export function Telemetry() {
  const pathname = usePathname();

  useEffect(() => {
    const reachedChapters = new Set<string>();
    const engagedChapters = new Set<string>();
    let activeChapter: ActiveChapter | null = null;

    const flushChapterEngagement = () => {
      if (!activeChapter || engagedChapters.has(activeChapter.id)) return;

      const dwellMs = Math.min(
        Math.max(Math.round(performance.now() - activeChapter.startedAt), 0),
        CHAPTER_ENGAGEMENT_CAP_MS,
      );
      if (dwellMs < CHAPTER_ENGAGEMENT_MIN_MS) return;

      safeTrack("chapter_engaged", {
        chapter: activeChapter.id,
        chapter_index: activeChapter.index,
        dwell_ms: dwellMs,
        dwell_bucket: getDwellBucket(dwellMs),
      });
      engagedChapters.add(activeChapter.id);
    };

    const enterChapter = (id: string) => {
      const chapter = chapterById.get(id as (typeof chapters)[number]["id"]);
      if (!chapter || activeChapter?.id === chapter.id) return;

      flushChapterEngagement();
      activeChapter = {
        id: chapter.id,
        index: chapter.index,
        label: chapter.label,
        startedAt: performance.now(),
      };

      if (!reachedChapters.has(chapter.id)) {
        safeTrack("chapter_reached", {
          chapter: chapter.id,
          chapter_index: chapter.index,
        });
        reachedChapters.add(chapter.id);
      }
    };

    const handleChapterChange = (event: Event) => {
      const detail = (event as CustomEvent<ChapterChangeDetail>).detail;
      if (detail?.id) enterChapter(detail.id);
    };

    const handleProductHandoff = (event: Event) => {
      const detail = (event as CustomEvent<ProductHandoffDetail>).detail;
      if (!detail?.slug || !productSlugs.has(detail.slug)) return;

      const source =
        detail.source === "card" || detail.source === "graph" || detail.source === "sequence" || detail.source === "link"
          ? detail.source
          : "unknown";
      const lens = detail.lens && graphModes.has(detail.lens) ? detail.lens : "all";

      safeTrack("product_handoff", {
        product: detail.slug,
        source,
        lens,
      });
    };

    const handleClick = (event: MouseEvent) => {
      if (!event.isTrusted) return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      const modeButton = target.closest<HTMLButtonElement>(".gwap-graph-mode-controls button");
      if (modeButton && modeButton.getAttribute("aria-pressed") !== "true") {
        const mode = getGraphModeFromButton(modeButton);
        if (mode) safeTrack("graph_mode_selected", { mode });
      }

      const graphNode = target.closest<HTMLButtonElement>("[data-gwap-graph-node]");
      const graphSlug = graphNode?.dataset.gwapGraphNode;
      if (
        graphNode &&
        graphSlug &&
        productSlugs.has(graphSlug) &&
        !graphNode.disabled &&
        graphNode.getAttribute("aria-disabled") !== "true"
      ) {
        safeTrack("graph_module_selected", {
          product: graphSlug,
          mode: getCurrentGraphMode(),
          source: "node",
        });
      }

      const relationButton = target.closest<HTMLButtonElement>(".gwap-graph-relations button");
      if (relationButton) {
        const relation = relationButton.querySelector("b")?.textContent?.trim().slice(0, 64);
        const neighborModule = relationButton.querySelector("em")?.textContent?.trim().slice(0, 64);
        if (relation && neighborModule) {
          safeTrack("graph_relation_selected", {
            relation,
            module: neighborModule,
            mode: getCurrentGraphMode(),
          });
        }
      }

      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      const rawHref = anchor.getAttribute("href") ?? "";
      const label = anchor.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) || "unknown";

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      const currentProduct = getCurrentProductSlug(pathname);
      if (currentProduct && url.origin === window.location.origin) {
        const returnTarget = url.pathname === "/" ? "home" : url.pathname === "/ecosystem" ? "ecosystem" : null;
        if (returnTarget) {
          safeTrack("context_return", {
            product: currentProduct,
            target: returnTarget,
          });
        }
      }

      if (rawHref.includes("#ecosystem")) {
        safeTrack("ecosystem_explore", { source: label });
        return;
      }

      if (productHosts.has(url.hostname)) {
        const productName = anchor.querySelector("h3")?.textContent?.trim() || label;
        safeTrack("product_launch", {
          product: productName.slice(0, 80),
          destination: url.hostname,
        });
        return;
      }

      if (communityHosts.has(url.hostname)) {
        safeTrack("community_click", {
          channel: label,
          destination: url.hostname,
        });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushChapterEngagement();
        activeChapter = null;
        return;
      }

      const currentChapter = document.documentElement.dataset.gwapChapter;
      if (currentChapter) enterChapter(currentChapter);
    };

    const handlePageHide = () => flushChapterEngagement();

    const graphRestoreObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (!(mutation.target instanceof HTMLElement)) continue;
        if (mutation.target.dataset.gwapMemoryRestored !== "true") continue;

        const graph = mutation.target.closest(".gwap-ecosystem-graph") ?? mutation.target;
        const stage = graph.querySelector<HTMLElement>(".gwap-graph-stage");
        const mode = stage?.dataset.graphMode;
        const product = stage?.dataset.activeProduct;

        safeTrack("context_restored", {
          target: "graph",
          mode: mode && graphModes.has(mode) ? mode : "all",
          product: product && productSlugs.has(product) ? product : "unknown",
        });
      }
    });

    const homeRestoreObserver = new MutationObserver(() => {
      const chapter = document.documentElement.dataset.gwapMemoryReturn;
      if (!chapter || !chapterById.has(chapter as (typeof chapters)[number]["id"])) return;
      safeTrack("context_restored", {
        target: "home",
        chapter,
      });
    });

    window.addEventListener("gwap:chapterchange", handleChapterChange);
    window.addEventListener("gwap:producthandoff", handleProductHandoff);
    document.addEventListener("click", handleClick, { capture: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    graphRestoreObserver.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ["data-gwap-memory-restored"],
    });
    homeRestoreObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-gwap-memory-return"],
    });

    const initialChapter = document.documentElement.dataset.gwapChapter;
    if (initialChapter) enterChapter(initialChapter);

    return () => {
      flushChapterEngagement();
      graphRestoreObserver.disconnect();
      homeRestoreObserver.disconnect();
      window.removeEventListener("gwap:chapterchange", handleChapterChange);
      window.removeEventListener("gwap:producthandoff", handleProductHandoff);
      document.removeEventListener("click", handleClick, { capture: true });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [pathname]);

  return null;
}
