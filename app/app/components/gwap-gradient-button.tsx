"use client";

import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  MouseEventHandler,
  ReactNode,
} from "react";

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
  onClick?: MouseEventHandler<HTMLAnchorElement>;
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
  onClick,
}: GwapGradientLinkProps) {
  return (
    <Link href={href} className={classes(variant, className)} onClick={onClick}>
      <span>{children}</span>
    </Link>
  );
}
