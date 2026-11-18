"use client";

import { cn } from "@/lib/utils";

export type LiveTradingTab =
  | "holdings"
  | "positions"
  | "strategies"
  | "trades"
  | "health";

interface LiveTabBarProps {
  active: LiveTradingTab;
  onChange: (tab: LiveTradingTab) => void;
  counts: {
    holdings: number;
    positions: number;
    trades: number;
    strategies: number;
  };
}

const TABS: {
  id: LiveTradingTab;
  label: string;
  countKey?: keyof LiveTabBarProps["counts"];
}[] = [
  { id: "holdings", label: "Holdings", countKey: "holdings" },
  { id: "positions", label: "Positions", countKey: "positions" },
  { id: "strategies", label: "Strategies Performance", countKey: "strategies" },
  { id: "trades", label: "Trades", countKey: "trades" },
  { id: "health", label: "Health" },
];

export default function LiveTabBar({ active, onChange, counts }: LiveTabBarProps) {
  return (
    <nav
      className="sticky top-0 z-20 -mx-1 px-1 py-2 mb-4 bg-bg-primary/95 backdrop-blur-sm border-b border-amber-200/60 md:static md:mx-0 md:px-0 md:py-0 md:mb-6 md:border-0 md:bg-transparent md:backdrop-blur-none"
      aria-label="Live trading sections"
    >
      <div
        className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
      >
        {TABS.map((tab) => {
          const count = tab.countKey ? counts[tab.countKey] : undefined;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                isActive
                  ? "bg-amber-100 text-amber-950 ring-1 ring-amber-400/50"
                  : "bg-bg-secondary text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
              )}
            >
              {tab.label}
              {count != null && count > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                    isActive
                      ? "bg-amber-200 text-amber-950"
                      : "bg-bg-tertiary text-text-tertiary"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
