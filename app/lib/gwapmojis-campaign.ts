// Campaign identity and timing. The pack file, its artwork and every download
// path live in `gwapmojis-pack.ts` — the single source of truth for the
// archive. The Cloudinary-hosted ZIPs this campaign used to point at were
// undeliverable (HTTP 401, "Untrusted File Access") and have been replaced by
// the committed static archive; do not reintroduce them.
export const GWAPMOJIS_CAMPAIGN = {
  id: "gwapmojis-gwapmode-33",
  title: "GwapMojis",
  subtitle: "GwapMode 33",
  badge: "NEW DROP",
  offer: "FREE",
  expiresAt: "2026-10-12T23:59:59-04:00",
  timezone: "America/New_York",
  deadlineLabel: "October 12, 2026 at 11:59 PM ET",
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
