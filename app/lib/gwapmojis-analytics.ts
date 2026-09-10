// Shared GwapMojis telemetry vocabulary. Homepage, GwapOS and the campaign page
// all emit the same event names through the existing Vercel Analytics setup.

export const GWAPMOJIS_EVENTS = {
  viewed: "gwapmojis_viewed",
  packDownloadStarted: "gwapmojis_pack_download_started",
  packDownloadRetry: "gwapmojis_pack_download_retry",
  stickerOpened: "gwapmojis_sticker_opened",
  // One event per Save click. This replaced `gwapmojis_individual_download`
  // when the Save action started serving the PNG share copy; emitting both
  // would double-count the same interaction.
  stickerSaveStarted: "gwapmojis_sticker_save_started",
  telegramClicked: "gwapmojis_telegram_clicked",
  howToOpened: "gwapmojis_howto_opened",
} as const;

export type GwapMojisSource = "homepage" | "gwapos" | "direct";
export type GwapMojisDeviceType = "ios" | "android" | "desktop";

const SOURCES: readonly GwapMojisSource[] = ["homepage", "gwapos", "direct"];

/**
 * Campaign attribution. An explicit `?source=` wins; otherwise the referring
 * path decides. Anything unrecognised is `direct` — never a raw user value.
 */
export function resolveGwapMojisSource(
  requestedSource?: string | null,
  referrerPath?: string | null,
): GwapMojisSource {
  const requested = requestedSource?.trim().toLowerCase();
  if (requested && (SOURCES as readonly string[]).includes(requested)) {
    return requested as GwapMojisSource;
  }

  const path = referrerPath?.trim().toLowerCase();
  if (!path) return "direct";
  if (path === "/app" || path.startsWith("/app/")) return "gwapos";
  if (path === "/") return "homepage";
  return "direct";
}

/**
 * Coarse device bucket used for the download instructions and analytics. This
 * reads only the user agent string; no personal information is collected.
 */
export function resolveGwapMojisDeviceType(userAgent?: string | null): GwapMojisDeviceType {
  const agent = userAgent?.toLowerCase() ?? "";
  if (!agent) return "desktop";
  if (/iphone|ipod/.test(agent)) return "ios";
  // iPadOS reports a desktop Safari user agent; touch support separates it.
  if (/ipad/.test(agent) || (/macintosh/.test(agent) && /mobile|touch/.test(agent))) return "ios";
  if (/android/.test(agent)) return "android";
  return "desktop";
}

export type GwapMojisDownloadInstructions = {
  title: string;
  status: string;
  where: string;
};

export function gwapMojisDownloadInstructions(
  device: GwapMojisDeviceType,
): GwapMojisDownloadInstructions {
  const title = "GwapMojis incoming.";
  const status = "Your GwapMode 33 pack is downloading.";

  if (device === "ios") {
    return { title, status, where: "On iPhone, find it in Files → Downloads." };
  }
  if (device === "android") {
    return { title, status, where: "Find it in Downloads." };
  }
  return { title, status, where: "Check your browser downloads." };
}

/**
 * Telegram is a secondary distribution channel. Only a real, configured
 * Telegram sticker URL renders a CTA — a missing one hides it entirely.
 */
export function resolveGwapMojisTelegramUrl(configuredUrl?: string | null): string | null {
  const candidate = configuredUrl?.trim();
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:") return null;
    if (url.hostname !== "t.me" && url.hostname !== "telegram.me") return null;
    if (!url.pathname.startsWith("/addstickers/")) return null;
    return url.toString();
  } catch {
    return null;
  }
}
