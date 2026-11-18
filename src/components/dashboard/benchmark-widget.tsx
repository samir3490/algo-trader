"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { formatPercent } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { getOrders, getPaperTradingState, getSettings } from "@/lib/firebase";
import { normalizePaperTrades, tradeExecutedAtMs } from "@/lib/paper-trades/normalize";
import { resolvePaperStartingBalance } from "@/lib/paper-trading/balance";
import { computePaperPortfolioAnalytics } from "@/lib/analytics/paper-analytics";
import MetricStrip from "@/components/ui/metric-strip";
import Panel, { PanelHeader } from "@/components/ui/panel";

interface BenchResult {
  paperReturnPct: number;
  benchmarkReturnPct: number;
  alphaPct: number;
}

/** Nifty 50 comparison for the paper book. */
export default function BenchmarkWidget({
  actions,
  className,
}: {
  actions?: ReactNode;
  className?: string;
} = {}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BenchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [state, orders, settings] = await Promise.all([
          getPaperTradingState(),
          getOrders(),
          getSettings(),
        ]);
        const trades = normalizePaperTrades(state.trades ?? [], orders);
        if (trades.length < 2) {
          if (!cancelled) {
            setData(null);
            setError("Need more paper trades for a benchmark.");
          }
          return;
        }
        const starting = resolvePaperStartingBalance(settings);
        const analytics = computePaperPortfolioAnalytics(
          trades,
          state.holdings ?? [],
          state.balance ?? starting,
          starting
        );
        const times = trades.map((t) => tradeExecutedAtMs(t)).filter((n) => n > 0);
        const startMs = Math.min(...times);
        const endMs = Math.max(...times);
        const res = await fetch("/api/analytics/benchmark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paperReturnPct: analytics.overall.totalReturnPct,
            initialCapital: starting,
            startDate: new Date(startMs).toISOString(),
            endDate: new Date(endMs).toISOString(),
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Benchmark failed");
        const comparison = json.comparison;
        if (!cancelled) {
          setData({
            paperReturnPct: comparison.paperReturnPct,
            benchmarkReturnPct: comparison.benchmarkReturnPct,
            alphaPct: comparison.alphaPct,
          });
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Benchmark failed");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <Panel className={className}>
      <PanelHeader
        title="vs Nifty 50"
        subtitle="Simulated paper book"
        action={actions}
      />
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-tertiary py-1">
          <Loader2 className="h-4 w-4 animate-spin" /> Comparing…
        </div>
      ) : error || !data ? (
        <p className="text-sm text-text-tertiary">{error || "Unavailable"}</p>
      ) : (
        <MetricStrip
          items={[
            {
              label: "Paper",
              value: formatPercent(data.paperReturnPct),
              tone: data.paperReturnPct >= 0 ? "profit" : "loss",
            },
            { label: "Nifty", value: formatPercent(data.benchmarkReturnPct) },
            {
              label: "Alpha",
              value: formatPercent(data.alphaPct),
              tone: data.alphaPct >= 0 ? "profit" : "loss",
            },
          ]}
        />
      )}
    </Panel>
  );
}
