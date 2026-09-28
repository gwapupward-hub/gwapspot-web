import type { Metadata } from "next";
import { CommerceApprovalSigner } from "./commerce-approval-signer";

export const metadata: Metadata = {
  title: "PPV Commerce Release Approval · 83b5e884",
  description:
    "Temporary Phantom signing page for the PPV Commerce devnet release at commit 83b5e884.",
  robots: { index: false, follow: false },
};

export default function PpvCommerceApproval83b5e884Page() {
  return <CommerceApprovalSigner />;
}
