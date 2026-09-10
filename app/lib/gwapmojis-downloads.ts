import { GWAPMOJIS_CAMPAIGN } from "./gwapmojis-campaign.ts";

export const GWAPMOJIS_DOWNLOADS = ([
  { key: "complete", label: "Complete", asset: "complete_zip", sourceUrl: GWAPMOJIS_CAMPAIGN.completeDownloadUrl },
  { key: "static", label: "Static 33", asset: "static_zip", sourceUrl: GWAPMOJIS_CAMPAIGN.staticDownloadUrl },
  { key: "animated", label: "Animated 33", asset: "animated_zip", sourceUrl: GWAPMOJIS_CAMPAIGN.animatedDownloadUrl },
  { key: "emoji", label: "Emoji 12", asset: "emoji_zip", sourceUrl: GWAPMOJIS_CAMPAIGN.emojiDownloadUrl },
] as const).map((download) => ({
  ...download,
  href: `/api/gwapmojis/download/${download.key}`,
}));

export type GwapMojisDownload = (typeof GWAPMOJIS_DOWNLOADS)[number];
