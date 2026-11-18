import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatCardMode = "paper" | "live" | "neutral";

export interface StatCardProps {
  label: string;
  primary: string;
  secondary?: string;
  hint?: string;
  icon: LucideIcon;
  colorClass?: string;
  className?: string;
  mode?: StatCardMode;
  dense?: boolean;
}

const modeStyles: Record<
  StatCardMode,
  { card: string; iconWell: string; icon: string }
> = {
  paper: {
    card: "border-mode-paper-border/70 bg-mode-paper-muted/40",
    iconWell: "bg-mode-paper-soft text-mode-paper",
    icon: "text-mode-paper",
  },
  live: {
    card: "border-mode-live-border/70 bg-mode-live-muted/40",
    iconWell: "bg-mode-live-soft text-mode-live",
    icon: "text-mode-live",
  },
  neutral: {
    card: "",
    iconWell: "bg-bg-tertiary text-text-secondary",
    icon: "text-text-secondary",
  },
};

/**
 * Content-sized KPI tile — does not stretch empty width.
 * Parent should use flex-wrap, not equal-width full-bleed grids.
 */
export default function StatCard({
  label,
  primary,
  secondary,
  hint,
  icon: Icon,
  colorClass = "text-text-primary",
  className,
  mode = "neutral",
  dense = true,
}: StatCardProps) {
  const chrome = modeStyles[mode];

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-bg-secondary inline-flex flex-col",
        "w-max max-w-full min-w-[9.5rem]",
        dense ? "px-2.5 py-2" : "px-3 py-2.5",
        chrome.card,
        className
      )}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <div className={cn("rounded-md shrink-0 p-1", chrome.iconWell)}>
          <Icon className={cn("w-3.5 h-3.5", chrome.icon)} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary leading-none">
          {label}
        </p>
      </div>
      <p
        className={cn(
          "font-bold tabular-nums leading-tight whitespace-nowrap",
          "text-base sm:text-lg",
          colorClass
        )}
      >
        {primary}
        {secondary ? (
          <span className={cn("ml-1.5 text-sm font-semibold", colorClass)}>
            {secondary}
          </span>
        ) : null}
      </p>
      {hint && (
        <p className="text-xs text-text-tertiary mt-0.5 leading-snug max-w-[14rem]">
          {hint}
        </p>
      )}
    </div>
  );
}
