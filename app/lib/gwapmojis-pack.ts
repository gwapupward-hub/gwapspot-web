// Canonical GwapMojis — GwapMode 33 distribution pack.
//
// The pack ships as a prebuilt static archive under `public/`, so the browser
// downloads a real HTTPS file. Never assemble this archive on the client.
// `app/lib/gwapmojis-pack.test.mjs` verifies this module against the artwork
// actually committed to `public/`; regenerate both together, never by hand.

export const GWAPMOJIS_PACK_FILENAME = "GwapMojis-GwapMode-33.zip";

/**
 * Same-origin static path. `GWAPMOJIS_PACK_URL` may point the CTA at external
 * object storage instead, but only when the deployment genuinely cannot serve
 * the archive itself.
 */
export const GWAPMOJIS_PACK_STATIC_PATH = `/downloads/${GWAPMOJIS_PACK_FILENAME}`;

export const GWAPMOJIS_STICKER_BASE_PATH = "/gwapmojis/stickers";

/**
 * Lossless PNG copies of the same 33 stickers, used for the per-sticker Save
 * action. The pack itself ships the canonical Telegram-format WebP artwork,
 * but iOS Photos cannot import WebP, so a WebP save cannot reach the
 * Files -> Photos -> Add Sticker path that the iMessage guide describes.
 * These PNGs decode to pixel-identical RGBA; the artwork is unchanged.
 */
export const GWAPMOJIS_SHARE_BASE_PATH = "/gwapmojis/share";

export const GWAPMOJIS_PACK_BYTES = 2_486_052;
export const GWAPMOJIS_PACK_SHA256 =
  "2ec2f44ee7fe582ca7bd2d5cc16fdceae6d32f55d1ede5f03c2f6f860028ec03";

export type GwapMojisSticker = {
  order: number;
  id: string;
  name: string;
  emoji: string;
  file: string;
  width: number;
  height: number;
  bytes: number;
  shareFile: string;
  shareBytes: number;
};

export const GWAPMOJIS_STICKERS: readonly GwapMojisSticker[] = [
  { order: 1, id: "01_big_gwap_laugh", name: "Big Gwap Laugh", emoji: "😂", file: "gwapmojis_gm33_01_big_gwap_laugh.webp", width: 512, height: 512, bytes: 69326, shareFile: "gwapmojis_gm33_01_big_gwap_laugh.png", shareBytes: 375607 },
  { order: 2, id: "02_money_eyes", name: "Money Eyes", emoji: "🤑", file: "gwapmojis_gm33_02_money_eyes.webp", width: 512, height: 512, bytes: 98894, shareFile: "gwapmojis_gm33_02_money_eyes.png", shareBytes: 517911 },
  { order: 3, id: "03_side_eye_gwap", name: "Side Eye Gwap", emoji: "🤨", file: "gwapmojis_gm33_03_side_eye_gwap.webp", width: 512, height: 512, bytes: 61070, shareFile: "gwapmojis_gm33_03_side_eye_gwap.png", shareBytes: 353289 },
  { order: 4, id: "04_gwap_approved", name: "Gwap Approved", emoji: "👍", file: "gwapmojis_gm33_04_gwap_approved.webp", width: 512, height: 512, bytes: 71876, shareFile: "gwapmojis_gm33_04_gwap_approved.png", shareBytes: 420400 },
  { order: 5, id: "05_locked_in", name: "Locked In", emoji: "😤", file: "gwapmojis_gm33_05_locked_in.webp", width: 512, height: 512, bytes: 74996, shareFile: "gwapmojis_gm33_05_locked_in.png", shareBytes: 415300 },
  { order: 6, id: "06_aint_no_way", name: "Aint No Way", emoji: "😳", file: "gwapmojis_gm33_06_aint_no_way.webp", width: 512, height: 512, bytes: 91990, shareFile: "gwapmojis_gm33_06_aint_no_way.png", shareBytes: 464683 },
  { order: 7, id: "07_mad_gwap", name: "Mad Gwap", emoji: "😡", file: "gwapmojis_gm33_07_mad_gwap.webp", width: 512, height: 512, bytes: 81070, shareFile: "gwapmojis_gm33_07_mad_gwap.png", shareBytes: 445625 },
  { order: 8, id: "08_say_less", name: "Say Less", emoji: "😎", file: "gwapmojis_gm33_08_say_less.webp", width: 512, height: 512, bytes: 70030, shareFile: "gwapmojis_gm33_08_say_less.png", shareBytes: 397667 },
  { order: 9, id: "09_gwap_victory", name: "Gwap Victory", emoji: "🏆", file: "gwapmojis_gm33_09_gwap_victory.webp", width: 512, height: 512, bytes: 107456, shareFile: "gwapmojis_gm33_09_gwap_victory.png", shareBytes: 492479 },
  { order: 10, id: "10_smirk_mode", name: "Smirk Mode", emoji: "😏", file: "gwapmojis_gm33_10_smirk_mode.webp", width: 512, height: 512, bytes: 69704, shareFile: "gwapmojis_gm33_10_smirk_mode.png", shareBytes: 382899 },
  { order: 11, id: "11_facepalm", name: "Facepalm", emoji: "🤦", file: "gwapmojis_gm33_11_facepalm.webp", width: 512, height: 512, bytes: 64144, shareFile: "gwapmojis_gm33_11_facepalm.png", shareBytes: 368755 },
  { order: 12, id: "12_much_love", name: "Much Love", emoji: "❤️", file: "gwapmojis_gm33_12_much_love.webp", width: 512, height: 512, bytes: 66238, shareFile: "gwapmojis_gm33_12_much_love.png", shareBytes: 375246 },
  { order: 13, id: "13_crying_laugh", name: "Crying Laugh", emoji: "🤣", file: "gwapmojis_gm33_13_crying_laugh.webp", width: 512, height: 512, bytes: 76096, shareFile: "gwapmojis_gm33_13_crying_laugh.png", shareBytes: 404988 },
  { order: 14, id: "14_heart_eyes", name: "Heart Eyes", emoji: "😍", file: "gwapmojis_gm33_14_heart_eyes.webp", width: 512, height: 512, bytes: 72236, shareFile: "gwapmojis_gm33_14_heart_eyes.png", shareBytes: 407241 },
  { order: 15, id: "15_thinkin", name: "Thinkin", emoji: "🤔", file: "gwapmojis_gm33_15_thinkin.webp", width: 512, height: 512, bytes: 54426, shareFile: "gwapmojis_gm33_15_thinkin.png", shareBytes: 309442 },
  { order: 16, id: "16_unimpressed", name: "Unimpressed", emoji: "🙄", file: "gwapmojis_gm33_16_unimpressed.webp", width: 512, height: 512, bytes: 58976, shareFile: "gwapmojis_gm33_16_unimpressed.png", shareBytes: 333167 },
  { order: 17, id: "17_salute", name: "Salute", emoji: "🫡", file: "gwapmojis_gm33_17_salute.webp", width: 512, height: 512, bytes: 68348, shareFile: "gwapmojis_gm33_17_salute.png", shareBytes: 389858 },
  { order: 18, id: "18_please_bruh", name: "Please Bruh", emoji: "🥺", file: "gwapmojis_gm33_18_please_bruh.webp", width: 512, height: 512, bytes: 59186, shareFile: "gwapmojis_gm33_18_please_bruh.png", shareBytes: 338168 },
  { order: 19, id: "19_bossed_up", name: "Bossed Up", emoji: "👑", file: "gwapmojis_gm33_19_bossed_up.webp", width: 512, height: 512, bytes: 65132, shareFile: "gwapmojis_gm33_19_bossed_up.png", shareBytes: 359373 },
  { order: 20, id: "20_plotting", name: "Plotting", emoji: "😼", file: "gwapmojis_gm33_20_plotting.webp", width: 512, height: 512, bytes: 65254, shareFile: "gwapmojis_gm33_20_plotting.png", shareBytes: 356031 },
  { order: 21, id: "21_too_much_gwap", name: "Too Much Gwap", emoji: "💰", file: "gwapmojis_gm33_21_too_much_gwap.webp", width: 512, height: 512, bytes: 116940, shareFile: "gwapmojis_gm33_21_too_much_gwap.png", shareBytes: 555971 },
  { order: 22, id: "22_cold_flex", name: "Cold Flex", emoji: "🧊", file: "gwapmojis_gm33_22_cold_flex.webp", width: 512, height: 512, bytes: 60978, shareFile: "gwapmojis_gm33_22_cold_flex.png", shareBytes: 341896 },
  { order: 23, id: "23_gwap_dance", name: "Gwap Dance", emoji: "🕺", file: "gwapmojis_gm33_23_gwap_dance.webp", width: 512, height: 512, bytes: 69412, shareFile: "gwapmojis_gm33_23_gwap_dance.png", shareBytes: 386268 },
  { order: 24, id: "24_fire_up", name: "Fire Up", emoji: "🔥", file: "gwapmojis_gm33_24_fire_up.webp", width: 512, height: 512, bytes: 116320, shareFile: "gwapmojis_gm33_24_fire_up.png", shareBytes: 546117 },
  { order: 25, id: "25_mic_drop", name: "Mic Drop", emoji: "🎤", file: "gwapmojis_gm33_25_mic_drop.webp", width: 512, height: 512, bytes: 77808, shareFile: "gwapmojis_gm33_25_mic_drop.png", shareBytes: 412233 },
  { order: 26, id: "26_happy_tears", name: "Happy Tears", emoji: "🥹", file: "gwapmojis_gm33_26_happy_tears.webp", width: 512, height: 512, bytes: 69148, shareFile: "gwapmojis_gm33_26_happy_tears.png", shareBytes: 372205 },
  { order: 27, id: "27_mind_blown", name: "Mind Blown", emoji: "🤯", file: "gwapmojis_gm33_27_mind_blown.webp", width: 512, height: 512, bytes: 82572, shareFile: "gwapmojis_gm33_27_mind_blown.png", shareBytes: 420248 },
  { order: 28, id: "28_alhamdulillah", name: "Alhamdulillah", emoji: "🙏", file: "gwapmojis_gm33_28_alhamdulillah.webp", width: 512, height: 512, bytes: 69412, shareFile: "gwapmojis_gm33_28_alhamdulillah.png", shareBytes: 375228 },
  { order: 29, id: "29_confused_gwap", name: "Confused Gwap", emoji: "😵‍💫", file: "gwapmojis_gm33_29_confused_gwap.webp", width: 512, height: 512, bytes: 80648, shareFile: "gwapmojis_gm33_29_confused_gwap.png", shareBytes: 411798 },
  { order: 30, id: "30_sleep_mode", name: "Sleep Mode", emoji: "😴", file: "gwapmojis_gm33_30_sleep_mode.webp", width: 512, height: 512, bytes: 70822, shareFile: "gwapmojis_gm33_30_sleep_mode.png", shareBytes: 388887 },
  { order: 31, id: "31_knocked_out", name: "Knocked Out", emoji: "😵", file: "gwapmojis_gm33_31_knocked_out.webp", width: 512, height: 512, bytes: 86844, shareFile: "gwapmojis_gm33_31_knocked_out.png", shareBytes: 418324 },
  { order: 32, id: "32_sick_today", name: "Sick Today", emoji: "🤒", file: "gwapmojis_gm33_32_sick_today.webp", width: 512, height: 512, bytes: 62126, shareFile: "gwapmojis_gm33_32_sick_today.png", shareBytes: 345324 },
  { order: 33, id: "33_hush_now", name: "Hush Now", emoji: "🤫", file: "gwapmojis_gm33_33_hush_now.webp", width: 512, height: 512, bytes: 66088, shareFile: "gwapmojis_gm33_33_hush_now.png", shareBytes: 378859 },
] as const;

export function gwapMojisStickerUrl(sticker: GwapMojisSticker) {
  return `${GWAPMOJIS_STICKER_BASE_PATH}/${sticker.file}`;
}

/** The PNG a visitor actually saves — see `GWAPMOJIS_SHARE_BASE_PATH`. */
export function gwapMojisStickerShareUrl(sticker: GwapMojisSticker) {
  return `${GWAPMOJIS_SHARE_BASE_PATH}/${sticker.shareFile}`;
}

export function gwapMojisStickerAlt(sticker: GwapMojisSticker) {
  return `GwapMojis GwapMode 33 sticker: ${sticker.name}`;
}

/**
 * Resolve the URL the download CTA points at. An empty or malformed override
 * falls back to the committed static archive so the CTA is never broken.
 */
export function resolveGwapMojisPackUrl(override?: string | null) {
  const candidate = override?.trim();
  if (!candidate) return GWAPMOJIS_PACK_STATIC_PATH;
  if (candidate.startsWith("/")) return candidate;
  try {
    const url = new URL(candidate);
    if (url.protocol === "https:") return url.toString();
  } catch {
    // Fall through to the committed static archive.
  }
  return GWAPMOJIS_PACK_STATIC_PATH;
}
