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

/** Mobile-friendly KPI card — no truncation; amounts wrap on narrow screens. */
export default function StatCard({
  label,
  primary,
  secondary,
  hint,
  icon: Icon,
  colorClass = "text-text-primary",
  className,
  mode = "neutral",
}: StatCardProps) {
  const chrome = modeStyles[mode];

  return (
    <div className={cn("card p-4", chrome.card, className)}>
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("p-2 rounded-lg shrink-0", chrome.iconWell)}>
          <Icon className={cn("w-4 h-4", chrome.icon)} />
        </div>
        <p className="type-label text-text-tertiary leading-tight">{label}</p>
      </div>
      <p
        className={cn(
          "text-lg sm:text-xl font-bold tabular-nums leading-snug break-words",
          colorClass
        )}
      >
        {primary}
      </p>
      {secondary && (
        <p className={cn("text-sm font-semibold tabular-nums mt-0.5", colorClass)}>
          {secondary}
        </p>
      )}
      {hint && <p className="type-caption text-text-tertiary mt-1.5 leading-snug">{hint}</p>}
    </div>
  );
}
