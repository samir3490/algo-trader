"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  /** Show product name beside company logo */
  showProduct?: boolean;
  productName?: string;
  collapsed?: boolean;
  className?: string;
  variant?: "sidebar" | "login" | "compact";
};

export default function BrandLogo({
  showProduct = true,
  productName = "AlgoTrader",
  collapsed = false,
  className,
  variant = "sidebar",
}: BrandLogoProps) {
  const logoHeight =
    variant === "login" ? 56 : variant === "compact" ? 28 : collapsed ? 36 : 40;

  return (
    <div className={cn("flex items-center gap-3 min-w-0", className)}>
      <div
        className={cn(
          "shrink-0 flex items-center justify-center overflow-hidden bg-bg-secondary",
          variant === "login"
            ? "rounded-xl shadow-md ring-1 ring-border px-3 py-2"
            : "rounded-lg ring-1 ring-border px-2 py-1.5"
        )}
      >
        <Image
          src="/brand/agrasen-logo.svg"
          alt="Agrasen Technologies"
          width={variant === "compact" ? 120 : 140}
          height={logoHeight}
          className="h-auto w-auto max-h-[var(--logo-h)] object-contain"
          style={{ "--logo-h": `${logoHeight}px` } as React.CSSProperties}
          priority={variant === "login"}
        />
      </div>
      {showProduct && !collapsed && (
        <div className="min-w-0 leading-tight">
          <p
            className={cn(
              "font-bold tracking-tight text-text-primary truncate",
              variant === "login" ? "text-xl" : "text-sm"
            )}
          >
            {productName}
          </p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-text-tertiary truncate">
            by Agrasen Technologies
          </p>
        </div>
      )}
    </div>
  );
}
