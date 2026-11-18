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
  /** Trading mode chrome — paper (sky), live (emerald), or neutral. */
  mode?: PageMode;
  /** Overrides the default mode eyebrow label. */
  eyebrow?: string;
  actions?: ReactNode;
  /** Extra content under the title row (KPI strip, banners, etc.). */
  children?: ReactNode;
  className?: string;
  /** Inner padding; mode headers usually need horizontal padding matching the page. */
  padded?: boolean;
}

/** Standard page header: title, subtitle, actions, optional mode strip. */
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
        padded && (mode === "neutral" ? "mb-6" : "px-3 sm:px-6 py-4 sm:py-5"),
        className
      )}
    >
      <div
        className={cn(
          "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3",
          children && "mb-4"
        )}
      >
        <div className="min-w-0">
          {showEyebrow && (
            <p
              className={cn(
                "type-label mb-1",
                chrome.eyebrow
              )}
            >
              {eyebrow ?? chrome.defaultEyebrow}
            </p>
          )}
          <h1 className={cn("type-display", chrome.title)}>{title}</h1>
          {subtitle && (
            <p className={cn("type-subtitle mt-1", chrome.subtitle)}>{subtitle}</p>
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
