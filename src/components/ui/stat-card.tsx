import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  primary: string;
  secondary?: string;
  hint?: string;
  icon: LucideIcon;
  colorClass?: string;
  className?: string;
}

/** Mobile-friendly KPI card — no truncation; amounts wrap on narrow screens. */
export default function StatCard({
  label,
  primary,
  secondary,
  hint,
  icon: Icon,
  colorClass = "text-text-primary",
  className,
}: StatCardProps) {
  return (
    <div className={cn("card p-4", className)}>
      <div className="flex items-center gap-2 mb-2">
        <div className="p-2 rounded-lg bg-bg-tertiary shrink-0 text-text-secondary">
          <Icon className="w-4 h-4" />
        </div>
        <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide leading-tight">
          {label}
        </p>
      </div>
      <p className={cn("text-lg sm:text-xl font-bold tabular-nums leading-snug break-words", colorClass)}>
        {primary}
      </p>
      {secondary && (
        <p className={cn("text-sm font-semibold tabular-nums mt-0.5", colorClass)}>{secondary}</p>
      )}
      {hint && (
        <p className="text-[11px] text-text-tertiary mt-1.5 leading-snug">{hint}</p>
      )}
    </div>
  );
}
