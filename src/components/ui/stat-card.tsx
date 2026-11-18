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
  /** Mode-aware chrome (icon well + border accent). */
  mode?: StatCardMode;
  /** Compact KPI — less padding, tighter type (default). */
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

/** Dense KPI tile — value first, no wasted vertical space. */
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
        "rounded-lg border border-border bg-bg-secondary",
        dense ? "px-2.5 py-2" : "card p-3",
        chrome.card,
        className
      )}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <div className={cn("rounded-md shrink-0", dense ? "p-1" : "p-1.5", chrome.iconWell)}>
          <Icon className={cn(dense ? "w-3 h-3" : "w-3.5 h-3.5", chrome.icon)} />
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-text-tertiary leading-none truncate">
          {label}
        </p>
      </div>
      <p
        className={cn(
          "font-bold tabular-nums leading-tight break-words",
          dense ? "text-base sm:text-lg" : "text-lg sm:text-xl",
          colorClass
        )}
      >
        {primary}
        {secondary ? (
          <span className={cn("ml-1.5 text-xs sm:text-sm font-semibold", colorClass)}>
            {secondary}
          </span>
        ) : null}
      </p>
      {hint && (
        <p className="text-[10px] text-text-tertiary mt-0.5 leading-snug line-clamp-2">
          {hint}
        </p>
      )}
    </div>
  );
}
