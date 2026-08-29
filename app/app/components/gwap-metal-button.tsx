"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type GwapMetalButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  compact?: boolean;
};

export function GwapMetalButton({
  children,
  className = "",
  compact = false,
  type = "button",
  ...props
}: GwapMetalButtonProps) {
  return (
    <button
      type={type}
      className={`gwap-metal-button${compact ? " is-compact" : ""} ${className}`.trim()}
      {...props}
    >
      <span className="gwap-metal-sheen" aria-hidden="true" />
      <span className="gwap-metal-content">{children}</span>
    </button>
  );
}
