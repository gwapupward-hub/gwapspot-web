import type { Metadata } from "next";
import TelegramGwapUtilityLayer from "./telegram-gwap-utility-layer";
import TelegramMiniApp from "./telegram-mini-app";

export const metadata: Metadata = {
  title: "GWAP · Telegram",
  description: "The Telegram-native edition of Tha GwapSpot, powered by Daily Ideas 2.0.",
  robots: { index: false, follow: false },
};

export default function TelegramPage() {
  const botUsername =
    process.env.DAILY_IDEAS_TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") ||
    process.env.NEXT_PUBLIC_DAILY_IDEAS_TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") ||
    "";

  return (
    <>
      <TelegramMiniApp botUsername={botUsername} />
      <TelegramGwapUtilityLayer />
    </>
  );
}
