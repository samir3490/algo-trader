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
  Inbox,
  PackageOpen,
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

// ── Portfolio Chart Data (flat line at initial balance) ─────────────────

const portfolioData = Array.from({ length: 30 }, (_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - (29 - i));
  return {
    date: date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
    value: 1000000,
  };
});

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
            <span className="text-sm font-medium text-text-secondary">
              {formatPercent(0)}
            </span>
            <span className="text-xs text-text-tertiary ml-1">all time</span>
          </div>
        </div>

        {/* Today's P&L */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-text-secondary">Today&apos;s P&amp;L</span>
            <div className="rounded-lg bg-bg-tertiary p-2">
              <TrendingUp className="h-4 w-4 text-text-secondary" />
            </div>
          </div>
          <p className="text-2xl font-bold text-text-primary">
            {formatCurrency(0)}
          </p>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-sm text-text-secondary">No trades today</span>
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
          <p className="text-2xl font-bold text-text-primary">0</p>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-sm text-text-secondary">No strategies active</span>
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
                domain={[990000, 1010000]}
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
          <div className="flex flex-col items-center justify-center py-12 px-5 text-center">
            <Inbox className="h-10 w-10 text-text-tertiary mb-3" />
            <p className="text-sm text-text-secondary">
              Add stocks to your watchlist to track them here.
            </p>
          </div>
        </div>

        {/* Recent Trades */}
        <div className="card !p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="text-lg font-semibold text-text-primary">Recent Trades</h2>
            <span className="text-xs text-text-tertiary">Paper Trading</span>
          </div>
          <div className="flex flex-col items-center justify-center py-12 px-5 text-center">
            <PackageOpen className="h-10 w-10 text-text-tertiary mb-3" />
            <p className="text-sm text-text-secondary">
              No trades yet. Place your first order in Paper Trading.
            </p>
          </div>
        </div>
      </div>

      {/* ── Section 4: Active Strategies ──────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Active Strategies
        </h2>
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <Inbox className="h-10 w-10 text-text-tertiary mb-3" />
          <p className="text-sm text-text-secondary">
            No active strategies. Create one in the Strategies page.
          </p>
        </div>
      </div>
    </div>
  );
}
