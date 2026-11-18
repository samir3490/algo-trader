"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import AnalyticsPanel from "@/components/analytics-panel";
import BacktestAdvancedPanel from "@/components/backtest-advanced-panel";
import LiveAnalyticsPanel from "@/components/reporting/live-analytics-panel";
import UnifiedPnlPanel from "@/components/reporting/unified-pnl-panel";
import ExecutiveSummaryButton from "@/components/reporting/executive-summary-button";
import TradeAuditPanel from "@/components/trade-audit-panel";

type Tab = "paper" | "live" | "pnl" | "audit" | "tools";

const TABS: { id: Tab; label: string }[] = [
  { id: "paper", label: "Paper" },
  { id: "live", label: "Live" },
  { id: "pnl", label: "P&L" },
  { id: "audit", label: "Audit" },
  { id: "tools", label: "Tools" },
];

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>("paper");

  return (
    <div className="min-h-screen p-3 sm:p-4 md:p-6 space-y-6 sm:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Analytics</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Portfolio metrics, benchmarks, optimization tools, and trade journal.
          </p>
        </div>
        <ExecutiveSummaryButton />
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-bg-secondary p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap",
              tab === t.id
                ? "bg-accent text-brand"
                : "text-text-secondary hover:bg-bg-hover"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "paper" && <AnalyticsPanel />}
      {tab === "live" && <LiveAnalyticsPanel />}
      {tab === "pnl" && <UnifiedPnlPanel />}
      {tab === "audit" && (
        <div className="card">
          <TradeAuditPanel />
        </div>
      )}
      {tab === "tools" && <BacktestAdvancedPanel />}
    </div>
  );
}
