import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PanelTone = "default" | "paper" | "live";

const toneClass: Record<PanelTone, string> = {
  default: "border-border bg-bg-secondary",
  paper: "border-mode-paper-border/60 bg-mode-paper-muted/80",
  live: "border-mode-live-border/60 bg-mode-live-muted/80",
};

/**
 * Soft elevated panel — the primary surface for dashboard & pages.
 */
export default function Panel({
  children,
  className,
  tone = "default",
  padding = "md",
}: {
  children: ReactNode;
  className?: string;
  tone?: PanelTone;
  padding?: "sm" | "md" | "lg";
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border shadow-[var(--shadow-panel)] h-full",
        toneClass[tone],
        padding === "sm" && "p-4",
        padding === "md" && "p-5",
        padding === "lg" && "p-6",
        className
      )}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 mb-4",
        className
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <h2 className="type-title text-text-primary">{title}</h2>
        {subtitle ? <p className="type-caption">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
