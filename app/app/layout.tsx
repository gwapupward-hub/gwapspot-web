import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GwapOsProvider } from "./components/os-provider";
import { OsShell } from "./components/os-shell";

export const metadata: Metadata = {
  title: "GWAP OS",
  description:
    "A local-first command center for launching products and preparing a unified GWAP identity.",
  robots: { index: false, follow: false },
};

export default function GwapOsLayout({ children }: { children: ReactNode }) {
  return (
    <GwapOsProvider>
      <OsShell>{children}</OsShell>
    </GwapOsProvider>
  );
}
