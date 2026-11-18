"use client";

import { BarChart3, BrainCircuit, ScrollText, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export type StrategiesSection = "configure" | "active" | "backtest" | "audit";

const SECTIONS: {
  id: StrategiesSection;
  label: string;
  shortLabel: string;
  icon: typeof BrainCircuit;
  description: string;
}[] = [
  {
    id: "configure",
    label: "Configure strategies",
    shortLabel: "Configure",
    icon: BrainCircuit,
    description: "Cards, parameters, activate",
  },
  {
    id: "active",
    label: "Active strategies",
    shortLabel: "Active",
    icon: Zap,
    description: "Running list and controls",
  },
  {
    id: "backtest",
    label: "Backtest",
    shortLabel: "Backtest",
    icon: BarChart3,
    description: "Historical simulation",
  },
  {
    id: "audit",
    label: "System audit",
    shortLabel: "Audit",
    icon: ScrollText,
    description: "Server logs and events",
  },
];

type Props = {
  active: StrategiesSection;
  onChange: (section: StrategiesSection) => void;
  activeCount?: number;
  runningCount?: number;
};

export default function StrategiesSectionNav({
  active,
  onChange,
  activeCount = 0,
  runningCount = 0,
}: Props) {
  return (
    <div className="sticky top-[53px] md:top-0 z-20 -mx-3 sm:-mx-4 md:-mx-6 px-3 sm:px-4 md:px-6 pt-1 pb-3 bg-bg-primary/95 backdrop-blur-md border-b border-border shadow-sm">
      <p className="text-[10px] uppercase tracking-[0.2em] text-text-tertiary mb-2 hidden sm:block">
        Jump to section
      </p>
      <nav
        className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none"
        aria-label="Strategy page sections"
      >
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = active === section.id;
          const badge =
            section.id === "active" && activeCount > 0
              ? runningCount > 0
                ? `${runningCount} live`
                : String(activeCount)
              : null;

          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onChange(section.id)}
              title={section.description}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-all",
                isActive
                  ? "border-accent bg-accent-muted shadow-sm ring-1 ring-accent/30"
                  : "border-border bg-bg-secondary hover:border-accent/40 hover:bg-bg-hover"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  isActive ? "text-accent" : "text-text-tertiary"
                )}
              />
              <span className="flex flex-col min-w-0">
                <span
                  className={cn(
                    "text-xs font-semibold whitespace-nowrap",
                    isActive ? "text-brand" : "text-text-primary"
                  )}
                >
                  <span className="sm:hidden">{section.shortLabel}</span>
                  <span className="hidden sm:inline">{section.label}</span>
                </span>
                <span className="text-[10px] text-text-tertiary hidden md:block truncate max-w-[140px]">
                  {section.description}
                </span>
              </span>
              {badge && (
                <span
                  className={cn(
                    "ml-1 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                    isActive
                      ? "bg-accent/30 text-brand"
                      : "bg-bg-tertiary text-text-secondary"
                  )}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export function strategiesSectionFromParam(
  value: string | null
): StrategiesSection | null {
  if (
    value === "configure" ||
    value === "active" ||
    value === "backtest" ||
    value === "audit"
  ) {
    return value;
  }
  return null;
}
