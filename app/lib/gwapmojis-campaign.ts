export const GWAPMOJIS_CAMPAIGN = {
  id: "gwapmojis-gwapmode-33",
  title: "GwapMojis",
  subtitle: "GwapMode 33",
  badge: "NEW DROP",
  offer: "FREE FOR A LIMITED TIME",
  expiresAt: "2026-10-12T23:59:59-04:00",
  timezone: "America/New_York",
  deadlineLabel: "October 12, 2026 at 11:59 PM ET",
  packIconUrl:
    "https://res.cloudinary.com/dg1u1wpdu/image/upload/v1788521171/gwapmojis/gwapmode33/pack-icon.png",
  headerUrl:
    "https://res.cloudinary.com/dg1u1wpdu/image/upload/v1788521177/gwapmojis/gwapmode33/header.png",
  completeDownloadUrl:
    "/downloads/gwapmode33/GwapMojis_GwapMode33_Complete_Telegram_Pack.zip",
  staticDownloadUrl:
    "/downloads/gwapmode33/GwapMojis_GwapMode33_Telegram_Static_33.zip",
  animatedDownloadUrl:
    "/downloads/gwapmode33/GwapMojis_GwapMode33_Animated_Full33_WEBM.zip",
  emojiDownloadUrl:
    "/downloads/gwapmode33/GwapMojis_GwapMode33_Core12_Custom_Emoji.zip",
  telegramUrl: "https://t.me/addstickers/GwapMode33",
} as const;

export type GwapMojisCountdown = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
  totalMilliseconds: number;
};

export function getGwapMojisCountdown(nowMilliseconds = Date.now()): GwapMojisCountdown {
  const deadlineMilliseconds = Date.parse(GWAPMOJIS_CAMPAIGN.expiresAt);
  const totalMilliseconds = Math.max(deadlineMilliseconds - nowMilliseconds, 0);
  const totalSeconds = Math.floor(totalMilliseconds / 1_000);

  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
    expired: totalMilliseconds <= 0,
    totalMilliseconds,
  };
}
