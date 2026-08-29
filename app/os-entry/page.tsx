import type { Metadata, Viewport } from "next";
import {
  gwapOsAppMetadata,
  gwapOsAppViewport,
} from "../lib/gwapos-app-metadata";
import { GwapOsSplash } from "./splash";

export const metadata: Metadata = {
  ...gwapOsAppMetadata,
  title: "Enter Tha GwapSpot",
  description: "Enter GWAP OS.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = gwapOsAppViewport;

export default function GwapOsEntryPage() {
  return <GwapOsSplash />;
}
