"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn, formatPercent } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { getOrders, getPaperTradingState, getSettings } from "@/lib/firebase";
import { normalizePaperTrades } from "@/lib/paper-trades/normalize";
import { resolvePaperStartingBalance } from "@/lib/paper-trading/balance";
import { computePaperPortfolioAnalytics } from "@/lib/analytics/paper-analytics";
import { tradeExecutedAtMs } from "@/lib/paper-trades/normalize";

interface BenchResult {
  paperReturnPct: number;
  benchmarkReturnPct: number;
  alphaPct: number;
}

/** Default Nifty 50 comparison on dashboard — no extra click required. */
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
    <section className="rounded-lg border border-border bg-bg-secondary p-2.5">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <h3 className="text-xs font-semibold text-text-primary">vs Nifty 50</h3>
        <span className="text-[10px] text-text-tertiary">Paper book</span>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-[11px] text-text-tertiary py-1">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Comparing…
        </div>
      ) : error || !data ? (
        <p className="text-[11px] text-text-tertiary">{error || "Unavailable"}</p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          <Kpi
            label="Paper"
            value={formatPercent(data.paperReturnPct)}
            tone={data.paperReturnPct >= 0 ? "profit" : "loss"}
          />
          <Kpi label="Nifty" value={formatPercent(data.benchmarkReturnPct)} />
          <Kpi
            label="Alpha"
            value={formatPercent(data.alphaPct)}
            tone={data.alphaPct >= 0 ? "profit" : "loss"}
          />
        </div>
      )}
    </section>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "profit" | "loss";
}) {
  return (
    <div className="rounded-md border border-border bg-bg-primary/50 px-2 py-1.5">
      <p className="text-[10px] text-text-tertiary">{label}</p>
      <p
        className={cn(
          "text-sm font-bold tabular-nums leading-tight",
          tone === "profit" && "text-profit",
          tone === "loss" && "text-loss"
        )}
      >
        {value}
      </p>
    </div>
  );
}
