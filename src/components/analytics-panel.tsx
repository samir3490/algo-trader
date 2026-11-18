"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Download,
  Loader2,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  getPaperTradingState,
  getSettings,
  type PaperTrade,
} from "@/lib/firebase";
import { resolvePaperStartingBalance } from "@/lib/paper-trading/balance";
import { computePaperPortfolioAnalytics } from "@/lib/analytics/paper-analytics";
import type { GroupedAnalytics } from "@/lib/analytics/paper-analytics";
import type { BenchmarkComparison } from "@/lib/analytics/benchmark";
import { buildTradeJournalCsv } from "@/lib/export/trade-journal";
import { downloadCsv, exportDateStamp } from "@/lib/export/csv";
import { useTableSort } from "@/hooks/use-table-sort";
import SortableTh from "@/components/ui/sortable-th";
import type { PaperPosition } from "@/lib/portfolio/types";

function formatPf(pf: number): string {
  if (!Number.isFinite(pf) || pf >= 99) return "∞";
  return pf.toFixed(2);
}

function MetricsGrid({
  metrics,
  compact,
}: {
  metrics: {
    totalReturnPct: number;
    sharpeRatio: number;
    maxDrawdownPct: number;
    profitFactor: number;
    winRate: number;
    closedRoundTrips: number;
    netPnl: number;
  };
  compact?: boolean;
}) {
  const items = [
    { label: "Return", value: formatPercent(metrics.totalReturnPct) },
    { label: "Sharpe", value: metrics.sharpeRatio.toFixed(2) },
    { label: "Max DD", value: formatPercent(-metrics.maxDrawdownPct) },
    { label: "Profit factor", value: formatPf(metrics.profitFactor) },
    { label: "Win rate", value: `${metrics.winRate.toFixed(1)}%` },
    { label: "Round trips", value: String(metrics.closedRoundTrips) },
    {
      label: "Net P&L",
      value: formatCurrency(metrics.netPnl),
      positive: metrics.netPnl >= 0,
    },
  ];
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 shrink-0">
          <p className="text-xs text-text-tertiary uppercase">{item.label}</p>
          <p
            className={cn(
              "text-base font-semibold tabular-nums leading-tight whitespace-nowrap",
              item.positive === true && "text-profit",
              item.positive === false && "text-loss"
            )}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function GroupTable({ title, rows }: { title: string; rows: GroupedAnalytics[] }) {
  const { sortKey, sortDir, toggleSort, sortRows } = useTableSort({
    key: "pnl",
    dir: "desc",
  });
  const sorted = useMemo(
    () =>
      sortRows(rows, {
        name: (r) => r.label,
        trips: (r) => r.roundTrips,
        pnl: (r) => r.metrics.netPnl,
        winRate: (r) => r.metrics.winRate,
        pf: (r) => r.metrics.profitFactor,
        sharpe: (r) => r.metrics.sharpeRatio,
      }),
    [rows, sortRows]
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-bg-secondary p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-2">{title}</h3>
        <p className="text-xs text-text-tertiary">No closed round-trips yet.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-bg-secondary overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      </div>
      <div className="md:hidden divide-y divide-border/50 max-h-64 overflow-y-auto">
        {sorted.map((r) => (
          <div key={r.key} className="px-3 py-2 inline-flex items-start gap-3 max-w-full">
            <div className="w-40 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{r.label}</p>
              <p className="text-xs text-text-tertiary">
                {r.roundTrips} trips · WR {r.metrics.winRate.toFixed(0)}%
              </p>
            </div>
            <p
              className={cn(
                "text-sm font-semibold tabular-nums whitespace-nowrap",
                r.metrics.netPnl >= 0 ? "text-profit" : "text-loss"
              )}
            >
              {formatCurrency(r.metrics.netPnl)}
            </p>
          </div>
        ))}
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-text-tertiary border-b border-border">
              <SortableTh sortKey="name" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="px-4 py-2 font-medium">Name</SortableTh>
              <SortableTh sortKey="trips" activeKey={sortKey} direction={sortDir} onSort={toggleSort} align="right" className="px-3 py-2 font-medium">Trips</SortableTh>
              <SortableTh sortKey="pnl" activeKey={sortKey} direction={sortDir} onSort={toggleSort} align="right" className="px-3 py-2 font-medium">Net P&L</SortableTh>
              <SortableTh sortKey="winRate" activeKey={sortKey} direction={sortDir} onSort={toggleSort} align="right" className="px-3 py-2 font-medium">Win%</SortableTh>
              <SortableTh sortKey="pf" activeKey={sortKey} direction={sortDir} onSort={toggleSort} align="right" className="px-3 py-2 font-medium">PF</SortableTh>
              <SortableTh sortKey="sharpe" activeKey={sortKey} direction={sortDir} onSort={toggleSort} align="right" className="px-4 py-2 font-medium">Sharpe</SortableTh>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.key} className="border-b border-border/50 hover:bg-bg-tertiary/30">
                <td className="px-4 py-2 text-text-primary font-medium">{r.label}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.roundTrips}</td>
                <td
                  className={cn(
                    "px-3 py-2 text-right tabular-nums",
                    r.metrics.netPnl >= 0 ? "text-profit" : "text-loss"
                  )}
                >
                  {formatCurrency(r.metrics.netPnl)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.metrics.winRate.toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatPf(r.metrics.profitFactor)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {r.metrics.sharpeRatio.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AnalyticsPanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [holdings, setHoldings] = useState<
    { symbol: string; exchange: string; qty: number; avgPrice: number; ltp: number }[]
  >([]);
  const [balance, setBalance] = useState(0);
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [startingBalance, setStartingBalance] = useState(1_000_000);
  const [benchmark, setBenchmark] = useState<BenchmarkComparison | null>(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [paper, settings] = await Promise.all([
          getPaperTradingState(),
          getSettings(),
        ]);
        if (cancelled) return;
        setTrades(paper.trades ?? []);
        setHoldings(paper.holdings ?? []);
        setBalance(paper.balance ?? 0);
        setPositions((paper.positions ?? []) as PaperPosition[]);
        setStartingBalance(resolvePaperStartingBalance(settings));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const analytics = useMemo(() => {
    if (loading) return null;
    return computePaperPortfolioAnalytics(
      trades,
      holdings,
      balance,
      startingBalance
    );
  }, [trades, holdings, balance, startingBalance, loading]);

  const chartData = useMemo(() => {
    if (!analytics) return [];
    return analytics.equityCurve.map((p, i) => ({
      i,
      label: p.timestamp
        ? new Date(p.timestamp).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
          })
        : String(i),
      equity: Math.round(p.equity),
    }));
  }, [analytics]);

  const tradeRange = useMemo(() => {
    if (trades.length === 0) return null;
    const sorted = [...trades].sort(
      (a, b) =>
        new Date(a.executedAt ?? a.time).getTime() -
        new Date(b.executedAt ?? b.time).getTime()
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    return {
      start: (first.executedAt ?? first.date ?? "").slice(0, 10),
      end: (last.executedAt ?? last.date ?? new Date().toISOString()).slice(0, 10),
    };
  }, [trades]);

  async function loadBenchmark() {
    if (!analytics || !tradeRange) return;
    setBenchmarkLoading(true);
    setBenchmarkError("");
    try {
      const res = await fetch("/api/analytics/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paperReturnPct: analytics.overall.totalReturnPct,
          initialCapital: startingBalance,
          startDate: tradeRange.start,
          endDate: tradeRange.end,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Benchmark failed");
      setBenchmark(data.comparison);
    } catch (e) {
      setBenchmarkError(e instanceof Error ? e.message : "Benchmark failed");
    } finally {
      setBenchmarkLoading(false);
    }
  }

  function exportJournal() {
    const csv = buildTradeJournalCsv(trades, positions);
    downloadCsv(`trade-journal-${exportDateStamp()}.csv`, csv);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-text-secondary">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading analytics…
      </div>
    );
  }

  if (!analytics || trades.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-bg-secondary p-8 text-center">
        <BarChart3 className="h-10 w-10 text-text-tertiary mx-auto mb-3" />
        <p className="text-sm text-text-secondary">
          Run paper trading for a while to see portfolio analytics, benchmarks, and
          trade journal exports.
        </p>
      </div>
    );
  }

  const benchChart =
    benchmark &&
    benchmark.benchmarkCurve.map((b, i) => ({
      date: b.date,
      nifty: b.value,
      paper: benchmark.paperCurve[i]?.value ?? b.value,
    }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-accent" />
            Portfolio analytics
          </h2>
          <p className="text-xs text-text-secondary mt-1">
            Sharpe, drawdown, and profit factor from your paper trade history.
          </p>
        </div>
        <button
          type="button"
          onClick={exportJournal}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-text-secondary hover:bg-bg-tertiary"
        >
          <Download className="h-3.5 w-3.5" />
          Export trade journal
        </button>
      </div>

      <div className="card space-y-3">
        <h3 className="text-sm font-semibold text-text-primary">Overall</h3>
        <MetricsGrid metrics={analytics.overall} />
        <p className="text-[10px] text-text-tertiary">
          Realized {formatCurrency(analytics.pnlBreakdown.realizedPnl)} · Unrealized{" "}
          {formatCurrency(analytics.pnlBreakdown.unrealizedPnl)} · All-time{" "}
          {formatCurrency(analytics.pnlBreakdown.allTimePnl)}
        </p>
      </div>

      {chartData.length > 1 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Equity curve</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10 }}
                  stroke="var(--color-chart-axis)"
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  stroke="var(--color-chart-axis)"
                  width={70}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-bg-elevated)",
                    border: "1px solid var(--color-border)",
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke="var(--color-accent)"
                  fill="url(#eqFill)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <GroupTable title="By strategy" rows={analytics.byStrategy} />
        <GroupTable title="By symbol" rows={analytics.bySymbol} />
        <GroupTable title="By month (IST)" rows={analytics.byMonth} />
      </div>

      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-accent" />
              vs Nifty 50 buy-and-hold
            </h3>
            <p className="text-xs text-text-tertiary mt-1">
              Same date range as your paper trades ({tradeRange?.start} → {tradeRange?.end})
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadBenchmark()}
            disabled={benchmarkLoading}
            className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-brand disabled:opacity-50"
          >
            {benchmarkLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Compare"
            )}
          </button>
        </div>
        {benchmarkError && (
          <p className="text-xs text-loss flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            {benchmarkError}
          </p>
        )}
        {benchmark && (
          <>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <div className="min-w-0 shrink-0">
                <p className="text-xs font-medium text-text-tertiary leading-none mb-0.5">Paper</p>
                <p
                  className={cn(
                    "text-base sm:text-lg font-bold tabular-nums leading-tight",
                    benchmark.paperReturnPct >= 0 ? "text-profit" : "text-loss"
                  )}
                >
                  {formatPercent(benchmark.paperReturnPct)}
                </p>
              </div>
              <div className="min-w-0 shrink-0">
                <p className="text-xs font-medium text-text-tertiary leading-none mb-0.5">Nifty 50</p>
                <p className="text-base sm:text-lg font-bold tabular-nums text-text-primary leading-tight">
                  {formatPercent(benchmark.benchmarkReturnPct)}
                </p>
              </div>
              <div className="min-w-0 shrink-0">
                <p className="text-xs font-medium text-text-tertiary leading-none mb-0.5">Alpha</p>
                <p
                  className={cn(
                    "text-base sm:text-lg font-bold tabular-nums leading-tight",
                    benchmark.alphaPct >= 0 ? "text-profit" : "text-loss"
                  )}
                >
                  {formatPercent(benchmark.alphaPct)}
                </p>
              </div>
            </div>
            {benchChart && benchChart.length > 1 && (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={benchChart}>
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} hide />
                    <YAxis tick={{ fontSize: 10 }} width={70} />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="paper"
                      name="Paper"
                      stroke="var(--color-mode-paper)"
                      fill="var(--color-mode-paper)"
                      fillOpacity={0.1}
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="nifty"
                      name="Nifty 50"
                      stroke="var(--color-chart-muted)"
                      fill="var(--color-chart-muted)"
                      fillOpacity={0.05}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
