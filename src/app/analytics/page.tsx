"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import AnalyticsPanel from "@/components/analytics-panel";
import BacktestAdvancedPanel from "@/components/backtest-advanced-panel";
import LiveAnalyticsPanel from "@/components/reporting/live-analytics-panel";
import UnifiedPnlPanel from "@/components/reporting/unified-pnl-panel";
import ExecutiveSummaryButton from "@/components/reporting/executive-summary-button";
import TradeAuditPanel from "@/components/trade-audit-panel";
import PageHeader from "@/components/ui/page-header";

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
    <div className="min-h-screen p-2.5 sm:p-4 md:p-6 space-y-2.5 sm:space-y-3">
      <PageHeader
        title="Analytics"
        subtitle="Paper + live metrics, P&L, audit, exports"
        mode="neutral"
        padded={false}
        actions={<ExecutiveSummaryButton />}
      />

      <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-bg-secondary p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "px-3 py-2 rounded-md text-xs font-semibold whitespace-nowrap min-h-9 touch-manipulation",
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
        <div className="rounded-lg border border-border bg-bg-secondary p-2.5">
          <TradeAuditPanel />
        </div>
      )}
      {tab === "tools" && <BacktestAdvancedPanel />}
    </div>
  );
}
