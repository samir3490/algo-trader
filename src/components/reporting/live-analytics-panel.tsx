"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Loader2,
  Radio,
} from "lucide-react";
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
import { getOrders } from "@/lib/firebase";
import {
  aggregateEquityCurveByMonth,
  computePaperPortfolioAnalytics,
  reconstructOpenHoldings,
} from "@/lib/analytics/paper-analytics";
import type { GroupedAnalytics } from "@/lib/analytics/paper-analytics";
import { firestoreLiveOrdersToPaperTrades } from "@/lib/live-trading/live-order-record";
import { attachFifoNetPnl } from "@/lib/portfolio/trade-period";
import { computeFifoRealizedPnl } from "@/lib/portfolio/compute-portfolio";
import { useTableSort } from "@/hooks/use-table-sort";
import SortableTh from "@/components/ui/sortable-th";

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

interface LiveSnap {
  available: number;
  dayPnl: number;
  holdingsPnl: number;
  accountId?: string;
  connected: boolean;
}

export default function LiveAnalyticsPanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [snap, setSnap] = useState<LiveSnap | null>(null);
  const [trades, setTrades] = useState<ReturnType<typeof firestoreLiveOrdersToPaperTrades>>(
    []
  );

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [orders, accountsRes] = await Promise.all([
          getOrders(1000),
          fetch("/api/zerodha/accounts"),
        ]);
        if (cancelled) return;
        const liveFs = orders.filter((o) => o.mode === "LIVE");
        setTrades(
          attachFifoNetPnl(firestoreLiveOrdersToPaperTrades(liveFs))
        );

        const accountsJson = await accountsRes.json().catch(() => ({}));
        const account =
          (accountsJson.accounts || []).find(
            (a: { connected?: boolean }) => a.connected !== false
          ) || (accountsJson.accounts || [])[0];

        if (!account?.kiteUserId) {
          setSnap({
            available: 0,
            dayPnl: 0,
            holdingsPnl: 0,
            connected: false,
          });
          return;
        }

        const [marginsRes, positionsRes, holdingsRes] = await Promise.all([
          fetch(`/api/zerodha/margins?accountId=${account.kiteUserId}`),
          fetch(`/api/zerodha/positions?accountId=${account.kiteUserId}`),
          fetch(`/api/zerodha/holdings?accountId=${account.kiteUserId}`),
        ]);
        const margins = marginsRes.ok ? await marginsRes.json() : {};
        const positions = positionsRes.ok
          ? (await positionsRes.json()).positions || []
          : [];
        const holdings = holdingsRes.ok
          ? (await holdingsRes.json()).holdings || []
          : [];
        let dayPnl = 0;
        for (const p of positions) dayPnl += Number(p.pnl || 0);
        let holdingsPnl = 0;
        for (const h of holdings) holdingsPnl += Number(h.pnl || 0);
        if (!cancelled) {
          setSnap({
            available:
              Number(
                margins.available?.cash ?? margins.available?.live_balance ?? 0
              ) || 0,
            dayPnl,
            holdingsPnl,
            accountId: account.kiteUserId,
            connected: true,
          });
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

  const analytics = useMemo(() => {
    if (loading || trades.length === 0) return null;
    const holdings = reconstructOpenHoldings(trades);
    const invested = holdings.reduce((s, h) => s + h.qty * h.avgPrice, 0);
    const realized = computeFifoRealizedPnl(trades);
    // Synthetic starting capital so equity curve / return stay meaningful without
    // a known live deposit history: cash≈0 + invested − realized ≈ capital in.
    const balance = snap?.available ?? 0;
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
  }, [trades, loading, snap?.available]);

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

  if (trades.length === 0 && !snap?.connected) {
    return (
      <div className="card text-center py-10">
        <Radio className="h-8 w-8 text-text-tertiary mx-auto mb-3" />
        <p className="text-sm font-semibold text-text-primary">
          Live analytics unavailable
        </p>
        <p className="text-sm text-text-secondary mt-1">
          Place live trades or connect Zerodha to see live portfolio metrics.
        </p>
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="space-y-4">
        {snap && (
          <div className="card">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-lg font-semibold text-text-primary">
                Live broker snapshot
              </h2>
              {snap.accountId && (
                <span className="text-xs text-emerald-700 font-medium">
                  {snap.accountId}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <div>
                <p className="text-xs text-text-tertiary">Cash</p>
                <p className="text-base font-bold tabular-nums">
                  {formatCurrency(snap.available)}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary">Day P&L</p>
                <p
                  className={cn(
                    "text-base font-bold tabular-nums",
                    snap.dayPnl >= 0 ? "text-profit" : "text-loss"
                  )}
                >
                  {formatCurrency(snap.dayPnl)}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary">Holdings P&L</p>
                <p
                  className={cn(
                    "text-base font-bold tabular-nums",
                    snap.holdingsPnl >= 0 ? "text-profit" : "text-loss"
                  )}
                >
                  {formatCurrency(snap.holdingsPnl)}
                </p>
              </div>
            </div>
            <p className="text-xs text-text-tertiary mt-3">
              No saved LIVE fills in history yet — strategy tables appear after
              completed live orders are recorded.
            </p>
          </div>
        )}
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
          Realized metrics from saved LIVE fills
          {snap?.accountId ? ` · ${snap.accountId}` : ""}.
        </p>
      </div>

      {snap?.connected && (
        <div className="card">
          <h3 className="text-sm font-semibold text-text-primary mb-2">
            Broker snapshot
          </h3>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <div>
              <p className="text-xs text-text-tertiary">Cash</p>
              <p className="text-base font-semibold tabular-nums">
                {formatCurrency(snap.available)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">Day P&L</p>
              <p
                className={cn(
                  "text-base font-semibold tabular-nums",
                  snap.dayPnl >= 0 ? "text-profit" : "text-loss"
                )}
              >
                {formatCurrency(snap.dayPnl)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">Holdings P&L</p>
              <p
                className={cn(
                  "text-base font-semibold tabular-nums",
                  snap.holdingsPnl >= 0 ? "text-profit" : "text-loss"
                )}
              >
                {formatCurrency(snap.holdingsPnl)}
              </p>
            </div>
          </div>
        </div>
      )}

      {analytics && (
        <>
          <div className="card space-y-3">
            <h3 className="text-sm font-semibold text-text-primary">Overall</h3>
            <MetricsGrid metrics={analytics.overall} />
            <p className="text-[10px] text-text-tertiary">
              Closed (FIFO) {formatCurrency(analytics.pnlBreakdown.realizedPnl)} ·
              Open unrealized{" "}
              {formatCurrency(analytics.pnlBreakdown.unrealizedPnl)} · All-time
              (closed + open){" "}
              {formatCurrency(
                analytics.pnlBreakdown.realizedPnl +
                  analytics.pnlBreakdown.unrealizedPnl
              )}
            </p>
          </div>

          {chartData.length > 1 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-text-primary mb-3">
                Equity curve (by month)
              </h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="liveEqFill" x1="0" y1="0" x2="0" y2="1">
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
      )}
    </div>
  );
}
