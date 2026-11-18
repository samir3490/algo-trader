import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PageMode = "paper" | "live" | "neutral";

const modeChrome: Record<
  PageMode,
  {
    wrap: string;
    eyebrow: string;
    title: string;
    subtitle: string;
    defaultEyebrow: string;
  }
> = {
  paper: {
    wrap: "border-b border-mode-paper-border/80 bg-mode-paper-muted/80",
    eyebrow: "text-mode-paper-fg",
    title: "text-mode-paper-fg",
    subtitle: "text-mode-paper-fg/80",
    defaultEyebrow: "Simulated · paper book",
  },
  live: {
    wrap: "border-b border-mode-live-border/80 bg-mode-live-muted/80",
    eyebrow: "text-mode-live-fg",
    title: "text-mode-live-fg",
    subtitle: "text-mode-live-fg/80",
    defaultEyebrow: "Real money · Zerodha",
  },
  neutral: {
    wrap: "",
    eyebrow: "text-text-tertiary",
    title: "text-text-primary",
    subtitle: "text-text-secondary",
    defaultEyebrow: "",
  },
};

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  mode?: PageMode;
  eyebrow?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  padded?: boolean;
}

/** Compact page header — title row dense; optional mode strip. */
export default function PageHeader({
  title,
  subtitle,
  mode = "neutral",
  eyebrow,
  actions,
  children,
  className,
  padded = true,
}: PageHeaderProps) {
  const chrome = modeChrome[mode];
  const showEyebrow = Boolean(eyebrow ?? (mode !== "neutral" ? chrome.defaultEyebrow : ""));

  return (
    <header
      className={cn(
        chrome.wrap,
        padded && (mode === "neutral" ? "mb-3" : "px-3 sm:px-4 py-2.5 sm:py-3"),
        className
      )}
    >
      <div
        className={cn(
          "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2",
          children && "mb-2.5"
        )}
      >
        <div className="min-w-0">
          {showEyebrow && (
            <p className={cn("text-[10px] font-semibold uppercase tracking-wide mb-0.5", chrome.eyebrow)}>
              {eyebrow ?? chrome.defaultEyebrow}
            </p>
          )}
          <h1 className={cn("text-xl sm:text-2xl font-bold leading-tight tracking-tight", chrome.title)}>
            {title}
          </h1>
          {subtitle && (
            <p className={cn("text-xs sm:text-sm mt-0.5 leading-snug", chrome.subtitle)}>
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto shrink-0">
            {actions}
          </div>
        )}
      </div>
      {children}
    </header>
  );
}
