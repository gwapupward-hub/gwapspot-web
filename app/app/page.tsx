import { DashboardView } from "./components/dashboard-view";
import { ecosystemProducts } from "../lib/ecosystem";

export default function GwapOsPage() {
  return <DashboardView products={ecosystemProducts} />;
}
