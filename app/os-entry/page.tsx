import type { Metadata } from "next";
import { GwapOsSplash } from "./splash";

export const metadata: Metadata = {
  title: "Enter Tha GwapSpot",
  description: "Enter GWAP OS.",
  robots: { index: false, follow: false },
};

export default function GwapOsEntryPage() {
  return <GwapOsSplash />;
}
