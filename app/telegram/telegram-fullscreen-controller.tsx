"use client";

import { useEffect } from "react";

type Insets = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

type TelegramFullscreenWebApp = {
  initData?: string;
  platform?: string;
  isFullscreen?: boolean;
  viewportHeight?: number;
  viewportStableHeight?: number;
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
  isVersionAtLeast?(version: string): boolean;
  requestFullscreen?(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  onEvent?(eventType: string, handler: (...args: unknown[]) => void): void;
  offEvent?(eventType: string, handler: (...args: unknown[]) => void): void;
};

type TelegramFullscreenWindow = Window & {
  Telegram?: { WebApp?: TelegramFullscreenWebApp };
};

const HOST_BG = "#070908";
const TELEGRAM_VIEWPORT_VARS = [
  "--tg-viewport-height",
  "--tg-viewport-stable-height",
  "--tg-safe-area-inset-top",
  "--tg-safe-area-inset-right",
  "--tg-safe-area-inset-bottom",
  "--tg-safe-area-inset-left",
  "--tg-content-safe-area-inset-top",
  "--tg-content-safe-area-inset-right",
  "--tg-content-safe-area-inset-bottom",
  "--tg-content-safe-area-inset-left",
  "--gwap-tg-host-top-clearance",
] as const;

function numeric(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function setPixelVariable(name: string, value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return;
  document.documentElement.style.setProperty(name, `${Math.round(value)}px`);
}

function resolveHostTopClearance(webApp: TelegramFullscreenWebApp) {
  const safeTop = numeric(webApp.safeAreaInset?.top);
  const reportedContentTop = numeric(webApp.contentSafeAreaInset?.top);
  const reportedTop = Math.max(safeTop, reportedContentTop);

  if (!webApp.isFullscreen) return reportedTop;

  // Telegram iOS can transiently report contentSafeAreaInset.top close to the
  // device notch inset while the transparent fullscreen Close/menu controls
  // are still settling. The screenshots from production showed real content
  // underneath those controls. Only add a fallback host-control reserve when
  // Telegram's reported content inset does not already exceed the device inset.
  const platform = (webApp.platform || "").toLowerCase();
  const hostControlsAreNotRepresented = reportedContentTop <= safeTop + 12;
  const hostControlReserve = platform === "ios" ? 72 : 56;

  return hostControlsAreNotRepresented
    ? safeTop + hostControlReserve
    : reportedTop;
}

function syncTelegramViewport(webApp: TelegramFullscreenWebApp) {
  setPixelVariable("--tg-viewport-height", webApp.viewportHeight);
  setPixelVariable("--tg-viewport-stable-height", webApp.viewportStableHeight);

  const safeTop = numeric(webApp.safeAreaInset?.top);
  const safeRight = numeric(webApp.safeAreaInset?.right);
  const safeBottom = numeric(webApp.safeAreaInset?.bottom);
  const safeLeft = numeric(webApp.safeAreaInset?.left);
  const contentTop = numeric(webApp.contentSafeAreaInset?.top);
  const contentRight = numeric(webApp.contentSafeAreaInset?.right);
  const contentBottom = numeric(webApp.contentSafeAreaInset?.bottom);
  const contentLeft = numeric(webApp.contentSafeAreaInset?.left);
  const resolvedTop = resolveHostTopClearance(webApp);

  setPixelVariable("--tg-safe-area-inset-top", safeTop);
  setPixelVariable("--tg-safe-area-inset-right", safeRight);
  setPixelVariable("--tg-safe-area-inset-bottom", safeBottom);
  setPixelVariable("--tg-safe-area-inset-left", safeLeft);

  // Keep the platform's raw content values for every edge except top. The top
  // value is hardened against a known transient iOS fullscreen overlap.
  setPixelVariable("--tg-content-safe-area-inset-top", resolvedTop);
  setPixelVariable("--tg-content-safe-area-inset-right", contentRight);
  setPixelVariable("--tg-content-safe-area-inset-bottom", contentBottom);
  setPixelVariable("--tg-content-safe-area-inset-left", contentLeft);
  setPixelVariable("--gwap-tg-host-top-clearance", resolvedTop);

  document.documentElement.dataset.telegramFullscreen = webApp.isFullscreen ? "true" : "false";
  document.documentElement.dataset.telegramPlatform = (webApp.platform || "unknown").toLowerCase();
}

export default function TelegramFullscreenController() {
  useEffect(() => {
    let cancelled = false;
    let pollTimer = 0;
    let stopTimer = 0;
    let cleanupHostEvents: (() => void) | null = null;

    const configure = () => {
      const webApp = (window as TelegramFullscreenWindow).Telegram?.WebApp;
      if (!webApp?.initData) return false;

      syncTelegramViewport(webApp);

      webApp.setHeaderColor?.(HOST_BG);
      webApp.setBackgroundColor?.(HOST_BG);
      if (webApp.isVersionAtLeast?.("7.10")) webApp.setBottomBarColor?.(HOST_BG);

      const sync = () => {
        // Telegram may update safe areas over several frames while fullscreen
        // settles, so synchronize immediately and once more after animation.
        syncTelegramViewport(webApp);
        window.setTimeout(() => {
          if (!cancelled) syncTelegramViewport(webApp);
        }, 180);
      };

      const fullscreenFailed = (...args: unknown[]) => {
        const failure = args[0];
        const error = failure && typeof failure === "object" && "error" in failure
          ? String((failure as { error?: unknown }).error || "")
          : "";
        if (error === "ALREADY_FULLSCREEN") sync();
      };

      webApp.onEvent?.("viewportChanged", sync);
      webApp.onEvent?.("safeAreaChanged", sync);
      webApp.onEvent?.("contentSafeAreaChanged", sync);
      webApp.onEvent?.("fullscreenChanged", sync);
      webApp.onEvent?.("fullscreenFailed", fullscreenFailed);

      cleanupHostEvents = () => {
        webApp.offEvent?.("viewportChanged", sync);
        webApp.offEvent?.("safeAreaChanged", sync);
        webApp.offEvent?.("contentSafeAreaChanged", sync);
        webApp.offEvent?.("fullscreenChanged", sync);
        webApp.offEvent?.("fullscreenFailed", fullscreenFailed);
      };

      if (webApp.isVersionAtLeast?.("8.0") && !webApp.isFullscreen) {
        window.setTimeout(() => {
          if (!cancelled) {
            try {
              webApp.requestFullscreen?.();
            } catch {
              // Fullscreen is enhancement-only. The Mini App remains usable in
              // Telegram's expanded full-height mode on unsupported clients.
            }
          }
        }, 0);
      }

      return true;
    };

    if (!configure()) {
      pollTimer = window.setInterval(() => {
        if (configure()) window.clearInterval(pollTimer);
      }, 100);
      stopTimer = window.setTimeout(() => window.clearInterval(pollTimer), 3000);
    }

    return () => {
      cancelled = true;
      window.clearInterval(pollTimer);
      window.clearTimeout(stopTimer);
      cleanupHostEvents?.();
      for (const variable of TELEGRAM_VIEWPORT_VARS) {
        document.documentElement.style.removeProperty(variable);
      }
      delete document.documentElement.dataset.telegramFullscreen;
      delete document.documentElement.dataset.telegramPlatform;
    };
  }, []);

  return null;
}
