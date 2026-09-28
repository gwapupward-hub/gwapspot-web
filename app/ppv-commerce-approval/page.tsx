import type { Metadata } from "next";
import { CommerceApprovalSigner } from "./commerce-approval-signer";

export const metadata: Metadata = {
  title: "PPV Commerce Release Approval",
  description: "Temporary wallet signing page for the PPV Commerce devnet release approval ceremony.",
  robots: { index: false, follow: false },
};

export default function PpvCommerceApprovalPage() {
  return <CommerceApprovalSigner />;
}
