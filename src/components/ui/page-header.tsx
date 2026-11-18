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
    wrap: "rounded-2xl border border-mode-paper-border/70 bg-mode-paper-muted/90 px-5 py-4 sm:px-6 sm:py-5",
    eyebrow: "text-mode-paper",
    title: "text-mode-paper-fg",
    subtitle: "text-mode-paper-fg/75",
    defaultEyebrow: "Simulated · paper book",
  },
  live: {
    wrap: "rounded-2xl border border-mode-live-border/70 bg-mode-live-muted/90 px-5 py-4 sm:px-6 sm:py-5",
    eyebrow: "text-mode-live",
    title: "text-mode-live-fg",
    subtitle: "text-mode-live-fg/75",
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

/** Elegant page header — clear hierarchy, optional mode surface. */
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
  const showEyebrow = Boolean(
    eyebrow ?? (mode !== "neutral" ? chrome.defaultEyebrow : "")
  );

  return (
    <header
      className={cn(
        chrome.wrap,
        padded && mode === "neutral" && "mb-1",
        className
      )}
    >
      <div
        className={cn(
          "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
          children && "mb-5"
        )}
      >
        <div className="min-w-0 space-y-1.5">
          {showEyebrow && (
            <p className={cn("type-label", chrome.eyebrow)}>
              {eyebrow ?? chrome.defaultEyebrow}
            </p>
          )}
          <h1
            className={cn(
              "type-display text-text-primary",
              chrome.title
            )}
          >
            {title}
          </h1>
          {subtitle && (
            <p className={cn("type-subtitle max-w-2xl", chrome.subtitle)}>
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
            {actions}
          </div>
        )}
      </div>
      {children}
    </header>
  );
}
