"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const MEMORY_KEY = "gwap-system-memory-v1";
const MEMORY_MAX_AGE = 12 * 60 * 60 * 1_000;
const RESUME_MAX_AGE = 30_000;

const chapterIds = new Set(["top", "overview", "ecosystem", "trust", "roadmap", "community"]);
const graphModes = new Set(["all", "identity", "trust", "commerce", "intelligence"]);
const productSlugs = new Set([
  "gns",
  "gwapscore",
  "dimi",
  "isnad-sunnah",
  "money-neva-sleeps",
  "marketplace",
  "occo",
  "private-proof-vault",
]);

type ResumeTarget = "home" | "ecosystem";
type ProductSource = "card" | "graph" | "sequence" | "link";

type SystemMemory = {
  at: number;
  chapter?: string;
  graphMode?: string;
  graphProduct?: string;
  lastProduct?: string;
  lastProductSource?: ProductSource;
  lastProductLens?: string;
  resumeTarget?: ResumeTarget;
  resumeAt?: number;
};

type ChapterChangeDetail = {
  id?: string;
};

type ProductHandoffDetail = {
  slug?: string;
  source?: ProductSource;
  lens?: string | null;
};

function isProductSource(value: unknown): value is ProductSource {
  return value === "card" || value === "graph" || value === "sequence" || value === "link";
}

function clearMemory() {
  try {
    window.sessionStorage.removeItem(MEMORY_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted browsing contexts.
  }
}

function readMemory(): SystemMemory | null {
  try {
    const raw = window.sessionStorage.getItem(MEMORY_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<SystemMemory>;
    if (typeof parsed.at !== "number" || Date.now() - parsed.at > MEMORY_MAX_AGE) {
      clearMemory();
      return null;
    }

    const memory: SystemMemory = { at: parsed.at };
    if (typeof parsed.chapter === "string" && chapterIds.has(parsed.chapter)) memory.chapter = parsed.chapter;
    if (typeof parsed.graphMode === "string" && graphModes.has(parsed.graphMode)) memory.graphMode = parsed.graphMode;
    if (typeof parsed.graphProduct === "string" && productSlugs.has(parsed.graphProduct)) memory.graphProduct = parsed.graphProduct;
    if (typeof parsed.lastProduct === "string" && productSlugs.has(parsed.lastProduct)) memory.lastProduct = parsed.lastProduct;
    if (isProductSource(parsed.lastProductSource)) memory.lastProductSource = parsed.lastProductSource;
    if (typeof parsed.lastProductLens === "string" && graphModes.has(parsed.lastProductLens)) memory.lastProductLens = parsed.lastProductLens;
    if (parsed.resumeTarget === "home" || parsed.resumeTarget === "ecosystem") memory.resumeTarget = parsed.resumeTarget;
    if (typeof parsed.resumeAt === "number") memory.resumeAt = parsed.resumeAt;
    return memory;
  } catch {
    clearMemory();
    return null;
  }
}

function writeMemory(patch: Partial<Omit<SystemMemory, "at">>) {
  try {
    const current = readMemory() ?? { at: Date.now() };
    const next: SystemMemory = { ...current, ...patch, at: Date.now() };
    window.sessionStorage.setItem(MEMORY_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable in privacy-restricted browsing contexts.
  }
}

function consumeResume(target: ResumeTarget) {
  const memory = readMemory();
  if (!memory || memory.resumeTarget !== target) return;
  writeMemory({ resumeTarget: undefined, resumeAt: undefined });
}

function resolveInternalPath(link: HTMLAnchorElement) {
  const href = link.getAttribute("href");
  if (!href) return null;

  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

function getGraphModeFromButton(button: HTMLButtonElement) {
  const label = button.querySelector("em")?.textContent?.trim().toLowerCase();
  if (label === "all rails") return "all";
  if (label && graphModes.has(label)) return label;
  return null;
}

function persistGraphState() {
  const stage = document.querySelector<HTMLElement>(".gwap-graph-stage[data-graph-mode][data-active-product]");
  if (!stage) return;

  const mode = stage.dataset.graphMode;
  const product = stage.dataset.activeProduct;
  writeMemory({
    graphMode: mode && graphModes.has(mode) ? mode : undefined,
    graphProduct: product && productSlugs.has(product) ? product : undefined,
  });
}

function restoreGraphContext(memory: SystemMemory) {
  let attempts = 0;
  const tryRestore = () => {
    const graph = document.querySelector<HTMLElement>(".gwap-ecosystem-graph");
    const stage = graph?.querySelector<HTMLElement>(".gwap-graph-stage");
    if (!graph || !stage) {
      attempts += 1;
      if (attempts < 8) window.requestAnimationFrame(tryRestore);
      return;
    }

    const desiredMode = memory.graphMode && graphModes.has(memory.graphMode) ? memory.graphMode : "all";
    const modeButtons = Array.from(graph.querySelectorAll<HTMLButtonElement>(".gwap-graph-mode-controls button"));
    const modeButton = modeButtons.find((button) => getGraphModeFromButton(button) === desiredMode);

    if (modeButton && stage.dataset.graphMode !== desiredMode) modeButton.click();

    window.requestAnimationFrame(() => {
      const desiredProduct = memory.graphProduct;
      if (desiredProduct && productSlugs.has(desiredProduct)) {
        const node = graph.querySelector<HTMLButtonElement>(`[data-gwap-graph-node="${desiredProduct}"]`);
        if (node && !node.disabled) node.click();
      }

      graph.dataset.gwapMemoryRestored = "true";
      window.setTimeout(() => delete graph.dataset.gwapMemoryRestored, 1_900);
    });
  };

  window.requestAnimationFrame(tryRestore);
}

function restoreHomeResume(memory: SystemMemory) {
  if (
    memory.resumeTarget !== "home" ||
    typeof memory.resumeAt !== "number" ||
    Date.now() - memory.resumeAt > RESUME_MAX_AGE ||
    !memory.chapter ||
    memory.chapter === "top" ||
    window.location.hash
  ) {
    return;
  }

  const target = document.getElementById(memory.chapter);
  if (!target) return;

  window.requestAnimationFrame(() => {
    target.scrollIntoView({ block: "start", behavior: "auto" });
    document.documentElement.dataset.gwapMemoryReturn = memory.chapter ?? "ecosystem";
    window.setTimeout(() => delete document.documentElement.dataset.gwapMemoryReturn, 1_900);
    consumeResume("home");
  });
}

function restoreEcosystemResume(memory: SystemMemory) {
  const product = memory.lastProduct ?? memory.graphProduct;
  if (!product || !productSlugs.has(product)) return;

  let attempts = 0;
  const tryRestore = () => {
    const card = document.querySelector<HTMLElement>(`.product-card--${product}`);
    if (!card) {
      attempts += 1;
      if (attempts < 8) window.requestAnimationFrame(tryRestore);
      return;
    }

    card.classList.add("gwap-memory-last-product");
    card.dataset.gwapMemoryLabel = "LAST ACTIVE MODULE";

    const shouldResume =
      memory.resumeTarget === "ecosystem" &&
      typeof memory.resumeAt === "number" &&
      Date.now() - memory.resumeAt <= RESUME_MAX_AGE;

    if (shouldResume) {
      card.scrollIntoView({ block: "center", behavior: "auto" });
      consumeResume("ecosystem");
    }
  };

  window.requestAnimationFrame(tryRestore);
}

export function GwapSystemMemoryLayer() {
  const pathname = usePathname();

  useEffect(() => {
    const onChapterChange = (event: Event) => {
      const detail = (event as CustomEvent<ChapterChangeDetail>).detail;
      if (detail?.id && chapterIds.has(detail.id)) writeMemory({ chapter: detail.id });
    };

    const onProductHandoff = (event: Event) => {
      const detail = (event as CustomEvent<ProductHandoffDetail>).detail;
      if (!detail?.slug || !productSlugs.has(detail.slug)) return;

      writeMemory({
        lastProduct: detail.slug,
        lastProductSource: isProductSource(detail.source) ? detail.source : undefined,
        lastProductLens: detail.lens && graphModes.has(detail.lens) ? detail.lens : undefined,
        graphMode: detail.source === "graph" && detail.lens && graphModes.has(detail.lens) ? detail.lens : undefined,
        graphProduct: detail.source === "graph" ? detail.slug : undefined,
      });
    };

    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;

      const modeButton = event.target.closest<HTMLButtonElement>(".gwap-graph-mode-controls button");
      const graphNode = event.target.closest<HTMLButtonElement>("[data-gwap-graph-node]");
      const graphRelation = event.target.closest<HTMLButtonElement>(".gwap-graph-relations button");
      if (modeButton || graphNode || graphRelation) {
        window.requestAnimationFrame(persistGraphState);
      }

      if (!/^\/ecosystem\/[^/]+$/.test(pathname)) return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank") return;
      const destination = resolveInternalPath(link);
      if (destination === "/") writeMemory({ resumeTarget: "home", resumeAt: Date.now() });
      if (destination === "/ecosystem") writeMemory({ resumeTarget: "ecosystem", resumeAt: Date.now() });
    };

    window.addEventListener("gwap:chapterchange", onChapterChange);
    window.addEventListener("gwap:producthandoff", onProductHandoff);
    document.addEventListener("click", onClick, { capture: true });

    return () => {
      window.removeEventListener("gwap:chapterchange", onChapterChange);
      window.removeEventListener("gwap:producthandoff", onProductHandoff);
      document.removeEventListener("click", onClick, { capture: true });
    };
  }, [pathname]);

  useEffect(() => {
    const memory = readMemory();
    if (!memory) return;

    if (pathname === "/") {
      restoreGraphContext(memory);
      restoreHomeResume(memory);
    } else if (pathname === "/ecosystem") {
      restoreEcosystemResume(memory);
    }

    return () => {
      document.querySelectorAll<HTMLElement>(".gwap-memory-last-product").forEach((card) => {
        card.classList.remove("gwap-memory-last-product");
        delete card.dataset.gwapMemoryLabel;
      });
      document.querySelectorAll<HTMLElement>("[data-gwap-memory-restored]").forEach((element) => {
        delete element.dataset.gwapMemoryRestored;
      });
    };
  }, [pathname]);

  return null;
}
