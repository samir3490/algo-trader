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

/** Elegant KPI strip — readable labels, calm spacing. */
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
        "flex flex-wrap items-start gap-x-8 gap-y-4",
        className
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0 shrink-0">
          <p className="type-label mb-1.5">{item.label}</p>
          <p
            className={cn(
              "text-xl font-semibold tabular-nums tracking-tight leading-none",
              toneClass[item.tone ?? "default"]
            )}
          >
            {item.value}
          </p>
          {item.sub != null && item.sub !== false && (
            <p className="type-caption mt-1.5">{item.sub}</p>
          )}
        </div>
      ))}
    </div>
  );
}
