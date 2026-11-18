"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "paper" | "live";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-brand hover:bg-accent-hover font-semibold shadow-sm",
  secondary:
    "bg-bg-secondary text-text-primary border border-border hover:bg-bg-hover",
  ghost: "bg-transparent text-text-secondary hover:bg-bg-hover hover:text-text-primary",
  danger: "bg-loss text-white hover:bg-loss/90 font-semibold",
  paper: "bg-mode-paper text-white hover:bg-mode-paper-hover font-semibold",
  live: "bg-mode-live text-white hover:bg-mode-live-hover font-semibold",
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 py-1.5 text-xs gap-1.5",
  md: "min-h-11 px-4 py-2.5 text-sm gap-2",
  lg: "min-h-12 px-5 py-3 text-base gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

/** Touch-friendly button — min 44px height on md+ sizes for mobile. */
export default function Button({
  variant = "primary",
  size = "md",
  loading,
  leftIcon,
  rightIcon,
  fullWidth,
  className,
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed touch-manipulation",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
}
