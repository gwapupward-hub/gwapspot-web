import type { Metadata } from "next";
import { DailyIdeasView } from "../components/daily-ideas-view";
import { TelegramLinkManager } from "../components/telegram-link-manager";

export const metadata: Metadata = {
  title: "Daily Ideas 2.0",
  description: "Turn inspiration into execution with opportunity discovery, saved ideas, development, validation, and project launch.",
};

export default function DailyIdeasPage() {
  return (
    <>
      <TelegramLinkManager />
      <DailyIdeasView />
    </>
  );
}
