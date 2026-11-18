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
    <div className="rounded-2xl border border-border bg-bg-secondary/90 p-2 shadow-[var(--shadow-panel)]">
      <nav
        className="flex gap-1.5 overflow-x-auto scrollbar-none"
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
                "flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left transition-all",
                isActive
                  ? "bg-brand text-white shadow-sm"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
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
                    isActive ? "text-white" : "text-text-primary"
                  )}
                >
                  <span className="sm:hidden">{section.shortLabel}</span>
                  <span className="hidden sm:inline">{section.label}</span>
                </span>
                <span
                  className={cn(
                    "hidden md:block text-[10px] leading-tight",
                    isActive ? "text-white/65" : "text-text-tertiary"
                  )}
                >
                  {section.description}
                </span>
              </span>
              {badge && (
                <span
                  className={cn(
                    "ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    isActive
                      ? "bg-accent text-brand"
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
): StrategiesSection {
  if (value === "active" || value === "backtest" || value === "audit") {
    return value;
  }
  return "configure";
}
