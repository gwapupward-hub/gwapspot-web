"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type GwapGradientButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "identity" | "warning";
};

export function GwapGradientButton({
  children,
  className = "",
  variant = "primary",
  type = "button",
  ...props
}: GwapGradientButtonProps) {
  return (
    <button
      type={type}
      className={`gwap-gradient-button variant-${variant} ${className}`.trim()}
      {...props}
    >
      <span>{children}</span>
    </button>
  );
}
