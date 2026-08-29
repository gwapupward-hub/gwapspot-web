"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type GwapGradientVariant = "primary" | "identity" | "warning";

type GwapGradientButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: GwapGradientVariant;
};

type GwapGradientLinkProps = {
  children: ReactNode;
  href: string;
  className?: string;
  variant?: GwapGradientVariant;
};

function classes(variant: GwapGradientVariant, className: string) {
  return `gwap-gradient-button variant-${variant} ${className}`.trim();
}

export function GwapGradientButton({
  children,
  className = "",
  variant = "primary",
  type = "button",
  ...props
}: GwapGradientButtonProps) {
  return (
    <button type={type} className={classes(variant, className)} {...props}>
      <span>{children}</span>
    </button>
  );
}

export function GwapGradientLink({
  children,
  href,
  className = "",
  variant = "primary",
}: GwapGradientLinkProps) {
  return (
    <Link href={href} className={classes(variant, className)}>
      <span>{children}</span>
    </Link>
  );
}
