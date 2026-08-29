"use client";

import Link from "next/link";
import { useEffect } from "react";

type GwapActionSheetProps = {
  open: boolean;
  onClose: () => void;
  hasGnsIdentity: boolean;
};

const groups = [
  {
    label: "Wallet",
    actions: [
      { href: "/app", label: "Send", note: "Move assets from your verified wallet", enabled: false },
      { href: "/app", label: "Receive", note: "Show your wallet identity", enabled: false },
      { href: "/app", label: "Swap", note: "Swap from your connected wallet", enabled: false },
    ],
  },
  {
    label: "Vault",
    actions: [
      { href: "/app/vault", label: "Create Proof", note: "Anchor evidence with Private Proof Vault", enabled: true },
      { href: "/app/vault", label: "Create Invoice", note: "Prepare a payment request", enabled: true },
      { href: "/app/vault", label: "Create Agreement", note: "Prepare terms for wallet signatures", enabled: true },
      { href: "/app/vault", label: "Request Payment", note: "Create a payable request", enabled: true },
    ],
  },
  {
    label: "Identity",
    actions: [
      { href: "/app/identity", label: "Claim .gwap", note: "Establish your GwapOS identity", enabled: true, onlyWithoutIdentity: true },
      { href: "/app/profile", label: "Share Profile", note: "Open your public identity tools", enabled: true },
      { href: "/app/score", label: "Verify Reputation", note: "Review GwapScore and trust signals", enabled: true },
    ],
  },
] as const;

export function GwapActionSheet({ open, onClose, hasGnsIdentity }: GwapActionSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="gwap-action-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="gwap-action-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gwap-action-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="gwap-action-sheet-head">
          <div>
            <small>GWAP OS</small>
            <h2 id="gwap-action-title">What do you want to do?</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close action menu">×</button>
        </div>

        <div className="gwap-action-groups">
          {groups.map((group) => {
            const visible = group.actions.filter((action) => !("onlyWithoutIdentity" in action && action.onlyWithoutIdentity && hasGnsIdentity));
            if (!visible.length) return null;
            return (
              <div className="gwap-action-group" key={group.label}>
                <span>{group.label}</span>
                <div>
                  {visible.map((action) => action.enabled ? (
                    <Link href={action.href} key={action.label} onClick={onClose}>
                      <strong>{action.label}</strong>
                      <small>{action.note}</small>
                      <i aria-hidden="true">→</i>
                    </Link>
                  ) : (
                    <button type="button" key={action.label} disabled>
                      <strong>{action.label}</strong>
                      <small>{action.note} · coming next</small>
                      <i aria-hidden="true">—</i>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
