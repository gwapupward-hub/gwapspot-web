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
] as const;

function setPixelVariable(name: string, value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return;
  document.documentElement.style.setProperty(name, `${value}px`);
}

function syncTelegramViewport(webApp: TelegramFullscreenWebApp) {
  setPixelVariable("--tg-viewport-height", webApp.viewportHeight);
  setPixelVariable("--tg-viewport-stable-height", webApp.viewportStableHeight);

  setPixelVariable("--tg-safe-area-inset-top", webApp.safeAreaInset?.top);
  setPixelVariable("--tg-safe-area-inset-right", webApp.safeAreaInset?.right);
  setPixelVariable("--tg-safe-area-inset-bottom", webApp.safeAreaInset?.bottom);
  setPixelVariable("--tg-safe-area-inset-left", webApp.safeAreaInset?.left);

  setPixelVariable("--tg-content-safe-area-inset-top", webApp.contentSafeAreaInset?.top);
  setPixelVariable("--tg-content-safe-area-inset-right", webApp.contentSafeAreaInset?.right);
  setPixelVariable("--tg-content-safe-area-inset-bottom", webApp.contentSafeAreaInset?.bottom);
  setPixelVariable("--tg-content-safe-area-inset-left", webApp.contentSafeAreaInset?.left);

  document.documentElement.dataset.telegramFullscreen = webApp.isFullscreen ? "true" : "false";
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

      // Telegram recommends explicitly setting host colors in fullscreen so
      // status-bar/navigation controls retain predictable contrast.
      webApp.setHeaderColor?.(HOST_BG);
      webApp.setBackgroundColor?.(HOST_BG);
      if (webApp.isVersionAtLeast?.("7.10")) webApp.setBottomBarColor?.(HOST_BG);

      const sync = () => syncTelegramViewport(webApp);
      const fullscreenFailed = (...args: unknown[]) => {
        const failure = args[0];
        const error = failure && typeof failure === "object" && "error" in failure
          ? String((failure as { error?: unknown }).error || "")
          : "";

        // ALREADY_FULLSCREEN is success-equivalent; UNSUPPORTED falls back to
        // Telegram's expanded full-height mode without disrupting the app.
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
    };
  }, []);

  return null;
}
