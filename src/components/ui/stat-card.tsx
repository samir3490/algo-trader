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
    card: "border-mode-paper-border/50 bg-mode-paper-muted/50",
    iconWell: "bg-mode-paper-soft text-mode-paper",
    icon: "text-mode-paper",
  },
  live: {
    card: "border-mode-live-border/50 bg-mode-live-muted/50",
    iconWell: "bg-mode-live-soft text-mode-live",
    icon: "text-mode-live",
  },
  neutral: {
    card: "",
    iconWell: "bg-bg-tertiary text-text-secondary",
    icon: "text-text-secondary",
  },
};

/** Polished KPI tile with calm padding. */
export default function StatCard({
  label,
  primary,
  secondary,
  hint,
  icon: Icon,
  colorClass = "text-text-primary",
  className,
  mode = "neutral",
  dense = false,
}: StatCardProps) {
  const chrome = modeStyles[mode];

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-bg-secondary inline-flex flex-col",
        "w-max max-w-full min-w-[10.5rem] shadow-[var(--shadow-panel)]",
        dense ? "px-3.5 py-3" : "px-4 py-3.5",
        chrome.card,
        className
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("rounded-lg shrink-0 p-1.5", chrome.iconWell)}>
          <Icon className={cn("w-3.5 h-3.5", chrome.icon)} />
        </div>
        <p className="type-label">{label}</p>
      </div>
      <p
        className={cn(
          "font-semibold tabular-nums tracking-tight leading-tight whitespace-nowrap",
          "text-lg sm:text-xl",
          colorClass
        )}
      >
        {primary}
        {secondary ? (
          <span className={cn("ml-2 text-sm font-medium", colorClass)}>
            {secondary}
          </span>
        ) : null}
      </p>
      {hint && (
        <p className="type-caption mt-1.5 max-w-[15rem]">{hint}</p>
      )}
    </div>
  );
}
