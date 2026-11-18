"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { formatPercent } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { getOrders, getPaperTradingState, getSettings } from "@/lib/firebase";
import { normalizePaperTrades, tradeExecutedAtMs } from "@/lib/paper-trades/normalize";
import { resolvePaperStartingBalance } from "@/lib/paper-trading/balance";
import { computePaperPortfolioAnalytics } from "@/lib/analytics/paper-analytics";

interface BenchResult {
  paperReturnPct: number;
  benchmarkReturnPct: number;
  alphaPct: number;
}

export default function BenchmarkWidget() {
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
    <section className="card">
      <h3 className="text-lg font-semibold text-text-primary mb-1">vs Nifty 50</h3>
      <p className="text-sm text-text-secondary mb-4">Paper book comparison</p>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-tertiary py-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Comparing…
        </div>
      ) : error || !data ? (
        <p className="text-sm text-text-tertiary">{error || "Unavailable"}</p>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-text-tertiary mb-1">Paper</p>
            <p
              className={`text-xl font-bold tabular-nums ${
                data.paperReturnPct >= 0 ? "text-profit" : "text-loss"
              }`}
            >
              {formatPercent(data.paperReturnPct)}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary mb-1">Nifty</p>
            <p className="text-xl font-bold tabular-nums text-text-primary">
              {formatPercent(data.benchmarkReturnPct)}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary mb-1">Alpha</p>
            <p
              className={`text-xl font-bold tabular-nums ${
                data.alphaPct >= 0 ? "text-profit" : "text-loss"
              }`}
            >
              {formatPercent(data.alphaPct)}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
