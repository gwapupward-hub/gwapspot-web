import { DailyIdeasView } from "../components/daily-ideas-view";
import { TelegramLinkManager } from "../components/telegram-link-manager";

export default function DailyIdeasPage() {
  return (
    <>
      <TelegramLinkManager />
      <DailyIdeasView />
    </>
  );
}
