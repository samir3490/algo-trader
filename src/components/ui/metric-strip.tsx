import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface MetricItem {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "profit" | "loss" | "paper" | "live";
}

const toneClass: Record<NonNullable<MetricItem["tone"]>, string> = {
  default: "text-text-primary",
  profit: "text-profit",
  loss: "text-loss",
  paper: "text-mode-paper-fg",
  live: "text-mode-live-fg",
};

/**
 * Content-hugging KPI strip — metrics sit side-by-side with tight gaps.
 * Avoids full-width cards that leave empty space after short values.
 */
export default function MetricStrip({
  items,
  className,
}: {
  items: MetricItem[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-x-5 gap-y-2",
        className
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0 shrink-0">
          <p className="text-xs font-medium text-text-tertiary leading-none mb-0.5">
            {item.label}
          </p>
          <p
            className={cn(
              "text-base sm:text-lg font-bold tabular-nums leading-tight",
              toneClass[item.tone ?? "default"]
            )}
          >
            {item.value}
          </p>
          {item.sub != null && item.sub !== false && (
            <p className="text-xs text-text-tertiary mt-0.5 leading-snug">{item.sub}</p>
          )}
        </div>
      ))}
    </div>
  );
}
