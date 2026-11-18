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
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1400px] space-y-6 sm:space-y-8">
      <PageHeader
        title="Analytics"
        subtitle="Paper + live metrics, P&L, audit, exports"
        mode="neutral"
        padded={false}
        actions={<ExecutiveSummaryButton />}
      />

      <div className="flex gap-1.5 overflow-x-auto rounded-2xl border border-border bg-bg-secondary p-1.5 shadow-[var(--shadow-panel)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap min-h-10 touch-manipulation transition-colors",
              tab === t.id
                ? "bg-brand text-white"
                : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
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
    </div>
  );
}
