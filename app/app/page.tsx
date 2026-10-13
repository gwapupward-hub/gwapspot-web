import { cookies } from "next/headers";
import { DashboardView } from "./components/dashboard-view";
import { ecosystemProducts } from "../lib/ecosystem";
import {
  GWAP_ENTRY_INTENT_COOKIE_KEY,
  isGwapEntryIntent,
} from "../lib/entry-intent";

export default async function GwapOsPage() {
  const cookieStore = await cookies();
  const storedIntent = cookieStore.get(GWAP_ENTRY_INTENT_COOKIE_KEY)?.value ?? null;
  const initialIntent = isGwapEntryIntent(storedIntent) ? storedIntent : null;

  return <DashboardView products={ecosystemProducts} initialIntent={initialIntent} />;
}
