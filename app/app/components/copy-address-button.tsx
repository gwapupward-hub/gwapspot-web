"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { shortenWalletAddress } from "../lib/wallet-format";

// Copy the connected wallet address to the clipboard with brief confirmation.
// Uses the async Clipboard API with a legacy execCommand fallback so it still
// works inside wallet WebViews that gate clipboard access.
export function CopyAddressButton({
  address,
  className,
}: {
  address: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(address);
        ok = true;
      }
    } catch {
      ok = false;
    }

    if (!ok) {
      try {
        const field = document.createElement("textarea");
        field.value = address;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        ok = document.execCommand("copy");
        document.body.removeChild(field);
      } catch {
        ok = false;
      }
    }

    if (!ok) return;
    setCopied(true);
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(false), 1_600);
  }, [address]);

  return (
    <button
      type="button"
      className={className}
      onClick={() => void copy()}
      aria-label={`Copy wallet address ${shortenWalletAddress(address)}`}
    >
      {copied ? "Copied ✓" : "Copy address"}
    </button>
  );
}
