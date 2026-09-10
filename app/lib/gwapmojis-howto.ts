// Platform instructions for using GwapMojis in messaging apps.
//
// Every step here describes something the visitor does themselves in a native
// app. The website cannot install a sticker into iOS, Android or Telegram, so
// nothing in this file may promise that it does. Where a platform feature is
// conditional (Apple's subject lift, Google's Photomoji, Telegram Premium),
// say so plainly rather than implying it always works.

import { GWAPMOJIS_TELEGRAM_PACK_URL } from "./gwapmojis-campaign.ts";
import type { GwapMojisDeviceType } from "./gwapmojis-analytics.ts";

export type GwapMojisPlatform = "ios" | "android" | "telegram";

export type GwapMojisGuideSection = {
  heading: string;
  steps: readonly string[];
  note?: string;
};

export type GwapMojisGuide = {
  id: GwapMojisPlatform;
  /** Short label for the accordion control. */
  label: string;
  /** Full heading shown once the guide is open. */
  headline: string;
  summary: string;
  sections: readonly GwapMojisGuideSection[];
  cta?: { label: string; href: string; note: string };
};

export const GWAPMOJIS_GUIDES: readonly GwapMojisGuide[] = [
  {
    id: "ios",
    label: "iPhone / iMessage",
    headline: "HOW TO ADD GWAPMOJIS TO IMESSAGE",
    summary:
      "Save a GwapMoji as a PNG, then let iOS turn it into a sticker — or just send it as a picture.",
    sections: [
      {
        heading: "Save one to Photos",
        steps: [
          "In the gallery above, tap Save on the GwapMoji you want.",
          "Touch and hold the picture and choose Add to Photos, or open Files → Downloads, then Share → Save Image.",
        ],
        note:
          "Save gives you a PNG. The ZIP holds the Telegram-format WebP files, which Photos cannot import — so use Save for this path.",
      },
      {
        heading: "Turn it into a sticker",
        steps: [
          "Open the picture in Photos.",
          "Touch and hold the character until it lifts off the background.",
          "Choose Add Sticker.",
          "In Messages, tap the Apps button, then Stickers, to use it.",
        ],
        note:
          "Add Sticker appears only when iOS can lift the subject from the background. It needs a recent iOS version and is not offered for every image or every device.",
      },
      {
        heading: "Send it right now",
        steps: [
          "Open a conversation in Messages.",
          "Tap the Apps button, then Photos.",
          "Pick your GwapMoji and send it.",
        ],
        note: "No sticker conversion needed — it sends like any other picture.",
      },
    ],
  },
  {
    id: "android",
    label: "Android / Google Messages",
    headline: "HOW TO USE GWAPMOJIS IN GOOGLE MESSAGES",
    summary: "Send a GwapMoji straight from your gallery, or build a Photomoji out of one.",
    sections: [
      {
        heading: "Send as a picture",
        steps: [
          "Tap Save on a GwapMoji above, or extract the pack you downloaded.",
          "Open Google Messages and a conversation.",
          "Tap the Gallery button.",
          "Pick your GwapMoji.",
          "Send.",
        ],
      },
      {
        heading: "Make a Photomoji",
        steps: [
          "Open a conversation.",
          "Open the emoji or sticker panel.",
          "Choose Create, then Photomoji.",
          "Pick your GwapMoji from the gallery.",
          "Finish Google's Photomoji flow.",
          "Send it, and reuse it later.",
        ],
        note:
          "On supported versions of Google Messages. Photomoji is Google's own feature and is not on every device or every messaging app.",
      },
    ],
  },
  {
    id: "telegram",
    label: "Telegram",
    headline: "ADD THE FULL GWAPMODE 33 PACK",
    summary: "The official GwapMode 33 sticker pack is already on Telegram. Adding it is one tap.",
    cta: {
      label: "ADD GWAPMODE 33 TO TELEGRAM",
      href: GWAPMOJIS_TELEGRAM_PACK_URL,
      note:
        "Official GwapMode 33 pack · Telegram Premium. Telegram decides who can add and use it. The download on this page stays free either way.",
    },
    sections: [
      {
        heading: "Add the pack",
        steps: [
          "Tap Add GwapMode 33 to Telegram.",
          "Telegram opens the official pack.",
          "Follow Telegram's own Add Stickers flow.",
          "Open any chat.",
          "Open your sticker panel.",
          "Pick a GwapMoji and send it.",
        ],
      },
      {
        heading: "Already downloaded the files?",
        steps: [
          "You can also build a custom set from the individual files with Telegram's @Stickers bot.",
        ],
        note: "That is the long way round — the pack above is already made for you.",
      },
    ],
  },
] as const;

/**
 * Presentation only. The detected device decides which guide leads and which
 * one starts open; every guide stays reachable on every device.
 */
export function orderGwapMojisGuides(
  device: GwapMojisDeviceType,
): readonly GwapMojisGuide[] {
  const lead = device === "ios" ? "ios" : device === "android" ? "android" : null;
  if (!lead) return GWAPMOJIS_GUIDES;
  return [
    ...GWAPMOJIS_GUIDES.filter((guide) => guide.id === lead),
    ...GWAPMOJIS_GUIDES.filter((guide) => guide.id !== lead),
  ];
}

/** Which guide the download-success shortcut jumps to. */
export function gwapMojisLeadPlatform(device: GwapMojisDeviceType): GwapMojisPlatform {
  if (device === "ios") return "ios";
  if (device === "android") return "android";
  return "telegram";
}

/** Label for the contextual shortcut in the download-success panel. */
export function gwapMojisHowToCtaLabel(device: GwapMojisDeviceType) {
  if (device === "ios") return "HOW TO ADD THEM TO IMESSAGE";
  if (device === "android") return "HOW TO USE THEM IN MESSAGES";
  return "HOW TO USE GWAPMOJIS";
}

export function gwapMojisGuideDomId(platform: GwapMojisPlatform) {
  return `gwapmojis-guide-${platform}`;
}
