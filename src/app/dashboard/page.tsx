"use client";

import {
  TrendingUp,
  TrendingDown,
  IndianRupee,
  Activity,
  BarChart3,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Target,
  ShieldCheck,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { formatCurrency, formatPercent, getMarketStatus, isMarketOpen } from "@/lib/utils";

// ── Mock Data ──────────────────────────────────────────────────────────

function generatePortfolioData() {
  const points = [];
  let value = 950000;
  const target = 1012450;
  const step = (target - value) / 29;

  for (let i = 0; i < 30; i++) {
    const noise = (Math.random() - 0.45) * 8000;
    value += step + noise;
    const date = new Date();
    date.setDate(date.getDate() - (29 - i));
    points.push({
      date: date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      value: Math.round(value),
    });
  }
  points[points.length - 1].value = 1012450;
  return points;
}

const portfolioData = generatePortfolioData();

const watchlist = [
  { symbol: "RELIANCE", ltp: 2934.55, change: 42.3, changePct: 1.46 },
  { symbol: "TCS", ltp: 3842.1, change: -28.65, changePct: -0.74 },
  { symbol: "HDFCBANK", ltp: 1678.9, change: 15.4, changePct: 0.93 },
  { symbol: "INFY", ltp: 1542.35, change: -12.8, changePct: -0.82 },
  { symbol: "ICICIBANK", ltp: 1123.45, change: 8.75, changePct: 0.78 },
  { symbol: "HINDUNILVR", ltp: 2456.7, change: -35.2, changePct: -1.41 },
  { symbol: "SBIN", ltp: 834.15, change: 11.6, changePct: 1.41 },
  { symbol: "BHARTIARTL", ltp: 1587.25, change: 23.45, changePct: 1.5 },
  { symbol: "ITC", ltp: 468.3, change: 3.15, changePct: 0.68 },
  { symbol: "KOTAKBANK", ltp: 1834.55, change: -18.9, changePct: -1.02 },
];

const recentTrades = [
  { symbol: "RELIANCE", side: "BUY" as const, qty: 50, price: 2892.25, time: "14:32" },
  { symbol: "TCS", side: "SELL" as const, qty: 25, price: 3870.75, time: "13:45" },
  { symbol: "HDFCBANK", side: "BUY" as const, qty: 100, price: 1663.5, time: "11:20" },
  { symbol: "INFY", side: "SELL" as const, qty: 75, price: 1555.15, time: "10:58" },
  { symbol: "SBIN", side: "BUY" as const, qty: 200, price: 822.55, time: "10:15" },
  { symbol: "ICICIBANK", side: "BUY" as const, qty: 60, price: 1114.7, time: "09:42" },
];

const activeStrategies = [
  {
    name: "NIFTY Mean Reversion",
    type: "Mean Reversion",
    symbol: "NIFTY 50",
    status: "Running",
    pnl: 8240,
    pnlPct: 2.1,
    trades: 47,
  },
  {
    name: "BANKNIFTY Momentum",
    type: "Momentum",
    symbol: "BANKNIFTY",
    status: "Running",
    pnl: 3150,
    pnlPct: 1.4,
    trades: 23,
  },
  {
    name: "RELIANCE Swing",
    type: "Swing Trading",
    symbol: "RELIANCE",
    status: "Paused",
    pnl: 1060,
    pnlPct: 0.5,
    trades: 12,
  },
];

// ── Custom Tooltip ─────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-bg-elevated px-3 py-2 shadow-xl">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="text-sm font-semibold text-text-primary">
        {formatCurrency(payload[0].value)}
      </p>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const marketOpen = isMarketOpen();
  const marketStatus = getMarketStatus();

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Overview of your portfolio &amp; strategies
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Clock className="h-4 w-4" />
          {new Date().toLocaleDateString("en-IN", {
            weekday: "short",
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </div>
      </div>

      {/* ── Section 1: Market Overview ───────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Portfolio Value */}
        <div className="card glow-accent">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-text-secondary">Portfolio Value</span>
            <div className="rounded-lg bg-accent-muted p-2">
              <IndianRupee className="h-4 w-4 text-accent" />
            </div>
          </div>
          <p className="text-2xl font-bold text-text-primary">
            {formatCurrency(1000000)}
          </p>
          <div className="flex items-center gap-1 mt-1">
            <ArrowUpRight className="h-3.5 w-3.5 text-profit" />
            <span className="text-sm font-medium text-profit">
              {formatPercent(2.5)}
            </span>
            <span className="text-xs text-text-tertiary ml-1">all time</span>
          </div>
        </div>

        {/* Today's P&L */}
        <div className="card glow-profit">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-text-secondary">Today&apos;s P&amp;L</span>
            <div className="rounded-lg bg-profit-muted p-2">
              <TrendingUp className="h-4 w-4 text-profit" />
            </div>
          </div>
          <p className="text-2xl font-bold text-profit">
            {formatCurrency(12450)}
          </p>
          <div className="flex items-center gap-1 mt-1">
            <ArrowUpRight className="h-3.5 w-3.5 text-profit" />
            <span className="text-sm font-medium text-profit">
              {formatPercent(1.25)}
            </span>
            <span className="text-xs text-text-tertiary ml-1">today</span>
          </div>
        </div>

        {/* Active Strategies */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-text-secondary">Active Strategies</span>
            <div className="rounded-lg bg-[#1e1b4b] p-2">
              <Zap className="h-4 w-4 text-[#a78bfa]" />
            </div>
          </div>
          <p className="text-2xl font-bold text-text-primary">3</p>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-sm text-text-secondary">2 running</span>
            <span className="text-xs text-text-tertiary">· 1 paused</span>
          </div>
        </div>

        {/* Market Status */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-text-secondary">NSE Status</span>
            <div className="rounded-lg bg-bg-tertiary p-2">
              <Activity className="h-4 w-4 text-text-secondary" />
            </div>
          </div>
          <p className="text-2xl font-bold text-text-primary">{marketStatus}</p>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`pulse-dot ${marketOpen ? "bg-profit" : "bg-text-tertiary"}`}
            />
            <span className="text-sm text-text-secondary">
              {marketOpen ? "NSE · 09:15 – 15:30" : "Opens 09:15 IST"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Section 2: Portfolio Performance Chart ────────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Portfolio Performance
            </h2>
            <p className="text-sm text-text-secondary">Last 30 days</p>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary">
            <BarChart3 className="h-3.5 w-3.5" />
            30D
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={portfolioData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <defs>
                <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#6b7280", fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#6b7280", fontSize: 11 }}
                tickFormatter={(v: number) => `₹${(v / 100000).toFixed(1)}L`}
                domain={["dataMin - 10000", "dataMax + 10000"]}
                width={60}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#portfolioGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Section 3: Watchlist & Recent Trades ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Watchlist */}
        <div className="card !p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="text-lg font-semibold text-text-primary">Watchlist</h2>
            <span className="text-xs text-text-tertiary">NSE</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-tertiary text-xs">
                  <th className="text-left font-medium px-5 py-2.5">Symbol</th>
                  <th className="text-right font-medium px-5 py-2.5">LTP</th>
                  <th className="text-right font-medium px-5 py-2.5">Change</th>
                  <th className="text-right font-medium px-5 py-2.5">Change %</th>
                </tr>
              </thead>
              <tbody>
                {watchlist.map((stock) => {
                  const positive = stock.change >= 0;
                  return (
                    <tr
                      key={stock.symbol}
                      className="border-b border-border/50 hover:bg-bg-hover cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3 font-medium text-text-primary">
                        {stock.symbol}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-text-primary">
                        {formatCurrency(stock.ltp)}
                      </td>
                      <td
                        className={`px-5 py-3 text-right font-mono ${
                          positive ? "text-profit" : "text-loss"
                        }`}
                      >
                        <span className="inline-flex items-center gap-1">
                          {positive ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          {formatCurrency(Math.abs(stock.change))}
                        </span>
                      </td>
                      <td
                        className={`px-5 py-3 text-right font-mono ${
                          positive ? "text-profit" : "text-loss"
                        }`}
                      >
                        {formatPercent(stock.changePct)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Trades */}
        <div className="card !p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="text-lg font-semibold text-text-primary">Recent Trades</h2>
            <span className="text-xs text-text-tertiary">Paper Trading</span>
          </div>
          <div className="divide-y divide-border/50">
            {recentTrades.map((trade, i) => {
              const isBuy = trade.side === "BUY";
              return (
                <div
                  key={`${trade.symbol}-${i}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-bg-hover transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                        isBuy
                          ? "bg-profit-muted text-profit"
                          : "bg-loss-muted text-loss"
                      }`}
                    >
                      {trade.side}
                    </div>
                    <div>
                      <p className="font-medium text-text-primary text-sm">
                        {trade.symbol}
                      </p>
                      <p className="text-xs text-text-tertiary">
                        {trade.qty} shares @ {formatCurrency(trade.price)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono text-text-primary">
                      {formatCurrency(trade.qty * trade.price)}
                    </p>
                    <p className="text-xs text-text-tertiary">{trade.time} IST</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Section 4: Active Strategies ──────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Active Strategies
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeStrategies.map((strategy) => {
            const profitable = strategy.pnl >= 0;
            const running = strategy.status === "Running";
            return (
              <div key={strategy.name} className="card-hover">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {strategy.type === "Mean Reversion" && (
                      <Target className="h-4 w-4 text-accent" />
                    )}
                    {strategy.type === "Momentum" && (
                      <TrendingUp className="h-4 w-4 text-warning" />
                    )}
                    {strategy.type === "Swing Trading" && (
                      <ShieldCheck className="h-4 w-4 text-info" />
                    )}
                    <h3 className="font-semibold text-text-primary text-sm">
                      {strategy.name}
                    </h3>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      running
                        ? "bg-profit-muted text-profit"
                        : "bg-bg-tertiary text-text-tertiary"
                    }`}
                  >
                    {running && <span className="pulse-dot bg-profit !h-1.5 !w-1.5" />}
                    {strategy.status}
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <span className="rounded bg-bg-tertiary px-2 py-0.5 text-xs font-mono text-text-secondary">
                    {strategy.symbol}
                  </span>
                  <span className="text-xs text-text-tertiary">{strategy.type}</span>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div>
                    <p className="text-xs text-text-tertiary mb-0.5">P&amp;L</p>
                    <p
                      className={`text-sm font-bold font-mono ${
                        profitable ? "text-profit" : "text-loss"
                      }`}
                    >
                      {profitable ? "+" : ""}
                      {formatCurrency(strategy.pnl)}{" "}
                      <span className="text-xs font-normal">
                        ({formatPercent(strategy.pnlPct)})
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-text-tertiary mb-0.5">Trades</p>
                    <p className="text-sm font-medium text-text-primary">
                      {strategy.trades}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
