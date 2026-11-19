"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Loader2, Radio } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  aggregateEquityCurveByMonth,
  computePaperPortfolioAnalytics,
  reconstructOpenHoldings,
} from "@/lib/analytics/paper-analytics";
import type { GroupedAnalytics } from "@/lib/analytics/paper-analytics";
import {
  loadLiveFillsClient,
  type LiveFillsBundle,
} from "@/lib/live-trading/load-live-fills";
import { computeFifoRealizedPnl } from "@/lib/portfolio/compute-portfolio";
import { useTableSort } from "@/hooks/use-table-sort";
import SortableTh from "@/components/ui/sortable-th";
import type { PaperTrade } from "@/lib/firebase";

function formatPf(pf: number): string {
  if (!Number.isFinite(pf) || pf >= 99) return "∞";
  return pf.toFixed(2);
}

function MetricsGrid({
  metrics,
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
}) {
  const items = [
    { label: "Return", value: formatPercent(metrics.totalReturnPct) },
    { label: "Sharpe", value: metrics.sharpeRatio.toFixed(2) },
    { label: "Max DD", value: formatPercent(-metrics.maxDrawdownPct) },
    { label: "Profit factor", value: formatPf(metrics.profitFactor) },
    { label: "Win rate", value: `${metrics.winRate.toFixed(1)}%` },
    { label: "Round trips", value: String(metrics.closedRoundTrips) },
    {
      label: "Net P&L (realized)",
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
        <p className="text-xs text-text-tertiary">No closed live round-trips yet.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-bg-secondary overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      </div>
      <div className="overflow-x-auto max-h-64 overflow-y-auto">
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

export default function LiveAnalyticsPanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState<LiveFillsBundle | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const next = await loadLiveFillsClient(1000);
        if (!cancelled) setBundle(next);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load live analytics");
          setBundle(null);
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

  const trades: PaperTrade[] = bundle?.trades ?? [];
  const broker = bundle?.broker;

  const analytics = useMemo(() => {
    if (loading || trades.length === 0) return null;
    const holdings = reconstructOpenHoldings(trades);
    const invested = holdings.reduce((s, h) => s + h.qty * h.avgPrice, 0);
    const realized = computeFifoRealizedPnl(trades);
    const balance = broker?.available ?? 0;
    const startingBalance = Math.max(
      1,
      Math.round(balance + invested - realized)
    );
    return computePaperPortfolioAnalytics(
      trades,
      holdings,
      balance,
      startingBalance
    );
  }, [trades, loading, broker?.available]);

  const chartData = useMemo(() => {
    if (!analytics) return [];
    return aggregateEquityCurveByMonth(analytics.equityCurve).map((p, i) => ({
      i,
      label: p.label,
      equity: p.equity,
    }));
  }, [analytics]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary p-3 flex items-center gap-2 text-xs text-text-tertiary">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading live analytics…
      </div>
    );
  }

  if (error) {
    return (
      <div className="card text-center py-10">
        <p className="text-sm font-semibold text-loss">{error}</p>
      </div>
    );
  }

  if (!broker?.connected && trades.length === 0) {
    return (
      <div className="card text-center py-10">
        <Radio className="h-8 w-8 text-text-tertiary mx-auto mb-3" />
        <p className="text-sm font-semibold text-text-primary">
          Live analytics unavailable
        </p>
        <p className="text-sm text-text-secondary mt-1">
          Connect Zerodha on Live Trading (or place a live order) so fills and
          broker snapshot can load here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-accent" />
          Live portfolio analytics
        </h2>
        <p className="text-xs text-text-secondary mt-1">
          Kite day-book + saved LIVE history
          {broker?.accountIds?.[0] ? ` · ${broker.accountIds.join(", ")}` : ""}.
          {bundle
            ? ` ${bundle.kiteOrderCount} today · ${bundle.firestoreLiveCount} saved.`
            : ""}
        </p>
      </div>

      {broker && (
        <div className="card">
          <h3 className="text-sm font-semibold text-text-primary mb-2">
            Broker snapshot
          </h3>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <div>
              <p className="text-xs text-text-tertiary">Cash</p>
              <p className="text-base font-semibold tabular-nums">
                {formatCurrency(broker.available)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">Day P&L</p>
              <p
                className={cn(
                  "text-base font-semibold tabular-nums",
                  broker.dayPnl >= 0 ? "text-profit" : "text-loss"
                )}
              >
                {formatCurrency(broker.dayPnl)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">Holdings P&L</p>
              <p
                className={cn(
                  "text-base font-semibold tabular-nums",
                  broker.holdingsPnl >= 0 ? "text-profit" : "text-loss"
                )}
              >
                {formatCurrency(broker.holdingsPnl)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">Open positions</p>
              <p className="text-base font-semibold tabular-nums">
                {broker.openPositions}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">Holdings</p>
              <p className="text-base font-semibold tabular-nums">
                {broker.holdingsCount}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">Live fills</p>
              <p className="text-base font-semibold tabular-nums">
                {trades.length}
              </p>
            </div>
          </div>
        </div>
      )}

      {trades.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-sm text-text-secondary">
            No completed live fills yet today. Place or wait for live orders —
            history from prior days appears once saved under LIVE mode.
          </p>
        </div>
      ) : (
        analytics && (
          <>
            <div className="card space-y-3">
              <h3 className="text-sm font-semibold text-text-primary">Overall</h3>
              <MetricsGrid metrics={analytics.overall} />
              <p className="text-[10px] text-text-tertiary">
                Closed (FIFO){" "}
                {formatCurrency(analytics.pnlBreakdown.realizedPnl)} · Open
                unrealized{" "}
                {formatCurrency(analytics.pnlBreakdown.unrealizedPnl)} ·
                All-time (closed + open){" "}
                {formatCurrency(
                  analytics.pnlBreakdown.realizedPnl +
                    analytics.pnlBreakdown.unrealizedPnl
                )}
              </p>
            </div>

            {chartData.length > 0 && (
              <div className="card">
                <h3 className="text-sm font-semibold text-text-primary mb-3">
                  Equity curve (by month)
                </h3>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient
                          id="liveEqFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="var(--color-accent)"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="100%"
                            stopColor="var(--color-accent)"
                            stopOpacity={0}
                          />
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
                        fill="url(#liveEqFill)"
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
          </>
        )
      )}
    </div>
  );
}
