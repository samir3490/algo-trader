"use client";

import AnalyticsPanel from "@/components/analytics-panel";
import BacktestAdvancedPanel from "@/components/backtest-advanced-panel";

export default function AnalyticsPage() {
  return (
    <div className="min-h-screen p-3 sm:p-4 md:p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Analytics</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Portfolio metrics, benchmarks, optimization tools, and trade journal.
        </p>
      </div>
      <AnalyticsPanel />
      <BacktestAdvancedPanel />
    </div>
  );
}
