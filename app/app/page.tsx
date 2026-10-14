import { cookies } from "next/headers";
import { DashboardView } from "./components/dashboard-view";
import {
  GWAP_ACTIVATION_SIGNAL_COOKIE_KEY,
  parseActivationSignal,
} from "../lib/activation-analytics";
import {
  GWAP_ENTRY_INTENT_COOKIE_KEY,
  isGwapEntryIntent,
} from "../lib/entry-intent";

export default async function GwapOsPage() {
  const cookieStore = await cookies();
  const storedIntent = cookieStore.get(GWAP_ENTRY_INTENT_COOKIE_KEY)?.value ?? null;
  const storedSignal = cookieStore.get(GWAP_ACTIVATION_SIGNAL_COOKIE_KEY)?.value ?? null;
  const initialIntent = isGwapEntryIntent(storedIntent) ? storedIntent : null;
  const initialSignal = parseActivationSignal(storedSignal);

  return (
    <DashboardView
      initialIntent={initialIntent}
      initialSignal={initialSignal}
    />
  );
}
