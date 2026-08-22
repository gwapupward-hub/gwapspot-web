import type { Metadata, Viewport } from "next";
import TelegramFullscreenController from "./telegram-fullscreen-controller";
import TelegramGwapUtilityLayer from "./telegram-gwap-utility-layer";
import TelegramMiniApp from "./telegram-mini-app";
import polish from "./telegram-fullscreen-polish.module.css";

export const metadata: Metadata = {
  title: "GWAP · Telegram",
  description: "The Telegram-native edition of Tha GwapSpot, powered by Daily Ideas 2.0.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#070908",
};

export default function TelegramPage() {
  const botUsername =
    process.env.DAILY_IDEAS_TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") ||
    process.env.NEXT_PUBLIC_DAILY_IDEAS_TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") ||
    "";

  return (
    <div className={polish.scope}>
      <TelegramFullscreenController />
      <TelegramMiniApp botUsername={botUsername} />
      <TelegramGwapUtilityLayer />
    </div>
  );
}
