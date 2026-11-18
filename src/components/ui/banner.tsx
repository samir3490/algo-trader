"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type BannerTone = "info" | "success" | "warning" | "danger" | "paper" | "live" | "neutral";

const toneStyles: Record<BannerTone, string> = {
  info: "border-info/30 bg-sky-50 text-sky-950",
  success: "border-profit/30 bg-profit-muted text-profit",
  warning: "border-warning/40 bg-amber-50 text-amber-950",
  danger: "border-loss/40 bg-loss-muted text-loss",
  paper: "border-mode-paper-border bg-mode-paper-muted text-mode-paper-fg",
  live: "border-mode-live-border bg-mode-live-muted text-mode-live-fg",
  neutral: "border-border bg-bg-secondary text-text-primary",
};

const icons: Record<BannerTone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertTriangle,
  paper: Info,
  live: AlertTriangle,
  neutral: Info,
};

export interface BannerProps {
  tone?: BannerTone;
  title?: string;
  children?: ReactNode;
  onDismiss?: () => void;
  className?: string;
  icon?: boolean;
}

export default function Banner({
  tone = "neutral",
  title,
  children,
  onDismiss,
  className,
  icon = true,
}: BannerProps) {
  const Icon = icons[tone];
  return (
    <div
      role="status"
      className={cn(
        "rounded-lg border px-3 py-3 sm:px-4 flex items-start gap-2.5",
        toneStyles[tone],
        className
      )}
    >
      {icon && <Icon className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 mt-0.5" />}
      <div className="min-w-0 flex-1">
        {title && <p className="text-sm font-semibold leading-snug">{title}</p>}
        {children && (
          <div className={cn("text-xs sm:text-sm leading-relaxed", title && "mt-1 opacity-90")}>
            {children}
          </div>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 p-1.5 -mr-1 -mt-1 rounded-lg hover:bg-black/5 touch-manipulation"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
