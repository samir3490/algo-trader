"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  IndianRupee,
  Wallet,
  BarChart3,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { cn, formatCurrency, formatPercent, isMarketOpen, getMarketStatus } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  getPaperTradingState,
  getOrders,
  getSettings,
  savePaperTradingState,
  type PaperTrade,
} from "@/lib/firebase";
import { mergePaperFills } from "@/lib/paper-trades/normalize";
import { refreshHoldingsLtpClient } from "@/lib/market-data/refresh-holdings-ltp";
import { loadSettingsFromCache } from "@/lib/settings/cache";
import { resolvePaperStartingBalance } from "@/lib/paper-trading/balance";
import {
  buildPortfolioChart,
  computePnlBreakdown,
  portfolioChartPeriodLabel,
  type PortfolioChartPeriod,
} from "@/lib/portfolio/compute-portfolio";
import {
  computeTradePeriodTotals,
  resolveTradeDateRange,
} from "@/lib/portfolio/trade-period";
import MarketTrendHero from "@/components/dashboard/market-trend-hero";
import SectorPerformanceChart from "@/components/dashboard/sector-performance-chart";
import PaperHealthStrip from "@/components/dashboard/paper-health-strip";

interface Holding {
  symbol: string;
  exchange: string;
  qty: number;
  avgPrice: number;
  ltp: number;
}

interface Trade {
  id: string;
  time: string;
  symbol: string;
  exchange: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
}

interface PaperState {
  balance: number;
  holdings: Holding[];
  trades: Trade[];
}

const PAPER_STORAGE_KEY = "paper_trading_state";
const INITIAL_BALANCE = 1000000;
const REFRESH_INTERVAL = 15_000;

function loadPaperStateFromCache(): PaperState {
  if (typeof window === "undefined") return { balance: INITIAL_BALANCE, holdings: [], trades: [] };
  try {
    const raw = localStorage.getItem(PAPER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        balance: parsed.balance ?? INITIAL_BALANCE,
        holdings: parsed.holdings ?? [],
        trades: parsed.trades ?? [],
      };
    }
  } catch {}
  return { balance: INITIAL_BALANCE, holdings: [], trades: [] };
}

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

export default function DashboardPage() {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const marketOpen = isMarketOpen();
  const marketStatus = getMarketStatus();

  const [paperState, setPaperState] = useState<PaperState>({ balance: INITIAL_BALANCE, holdings: [], trades: [] });
  const [startingBalance, setStartingBalance] = useState(INITIAL_BALANCE);
  const [chartPeriod, setChartPeriod] = useState<PortfolioChartPeriod>("week");

  useEffect(() => {
    if (!user) return;

    setPaperState(loadPaperStateFromCache());
    const cachedSettings = loadSettingsFromCache();
    setStartingBalance(cachedSettings.paperStartingBalance ?? INITIAL_BALANCE);

    async function loadFromFirestore() {
      try {
        const [fsState, orders, fsSettings] = await Promise.all([
          getPaperTradingState(),
          getOrders(),
          getSettings(),
        ]);

        const startBal = resolvePaperStartingBalance(fsSettings);
        setStartingBalance(startBal);

        const normalizedTrades = mergePaperFills(
          fsState.trades as PaperTrade[],
          orders
        );
        const pnlCheck = computePnlBreakdown(
          normalizedTrades,
          (fsState.holdings ?? []) as Holding[],
          fsState.balance ?? startBal,
          startBal
        );
        const paperWithTrades = {
          ...fsState,
          balance: pnlCheck.portfolio.balance,
          trades: normalizedTrades,
        };
        setPaperState(paperWithTrades);
        localStorage.setItem(PAPER_STORAGE_KEY, JSON.stringify(paperWithTrades));
        if (pnlCheck.cashRepaired) {
          void savePaperTradingState({
            balance: pnlCheck.portfolio.balance,
            holdings: fsState.holdings,
            positions: fsState.positions,
            trades: normalizedTrades,
          }).catch(() => {});
        }
      } catch (e) {
        console.error("Failed to load from Firestore, using localStorage cache:", e);
      }
    }

    loadFromFirestore();
    setMounted(true);
  }, [user]);

  const holdingsRef = useRef(paperState.holdings);
  holdingsRef.current = paperState.holdings;

  const holdingsRefreshKey = paperState.holdings
    .map((h) => `${h.symbol}:${h.qty}:${h.avgPrice}`)
    .join("|");

  useEffect(() => {
    if (!mounted || holdingsRef.current.length === 0 || !marketOpen) return;

    let cancelled = false;
    async function refresh() {
      const current = holdingsRef.current;
      const updated = await refreshHoldingsLtpClient(current);
      if (cancelled) return;
      const changed = updated.some((h, i) => h.ltp !== current[i]?.ltp);
      if (changed) {
        setPaperState((prev) => ({ ...prev, holdings: updated }));
      }
    }

    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [mounted, marketOpen, holdingsRefreshKey]);

  useEffect(() => {
    if (!mounted || !user) return;
    const resync = () => {
      void getPaperTradingState().then((fsState) => {
        setPaperState((prev) => ({
          ...prev,
          balance: fsState.balance ?? prev.balance,
          holdings: fsState.holdings?.length ? fsState.holdings : prev.holdings,
          trades: fsState.trades?.length ? fsState.trades : prev.trades,
        }));
      });
    };
    window.addEventListener("paper-trading-updated", resync);
    return () => window.removeEventListener("paper-trading-updated", resync);
  }, [mounted, user]);

  const normalizedTradesForPnl = mergePaperFills(
    paperState.trades as PaperTrade[]
  );
  const pnl = computePnlBreakdown(
    normalizedTradesForPnl,
    paperState.holdings,
    paperState.balance,
    startingBalance
  );
  const { portfolio, realizedPnl, allTimePnlPercent } = pnl;
  const invested = portfolio.invested;
  const isProfit = pnl.allTimePnl >= 0;

  const chartData = useMemo(
    () =>
      buildPortfolioChart(
        normalizedTradesForPnl,
        paperState.balance,
        paperState.holdings,
        startingBalance,
        chartPeriod
      ),
    [normalizedTradesForPnl, paperState.balance, paperState.holdings, startingBalance, chartPeriod]
  );
  const chartPeriodTotals = useMemo(() => {
    const range = resolveTradeDateRange(chartPeriod);
    return computeTradePeriodTotals(normalizedTradesForPnl, range);
  }, [normalizedTradesForPnl, chartPeriod]);
  const chartHasData = chartData.length > 1;
  const chartMin = chartHasData ? Math.min(...chartData.map((d) => d.value)) * 0.998 : 990000;
  const chartMax = chartHasData ? Math.max(...chartData.map((d) => d.value)) * 1.002 : 1010000;

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-text-tertiary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Market context &amp; portfolio overview
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-text-secondary">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              marketOpen
                ? "bg-profit/15 text-profit"
                : "bg-bg-tertiary text-text-tertiary"
            )}
          >
            <span className={cn("pulse-dot", marketOpen ? "bg-profit" : "bg-text-tertiary")} />
            {marketStatus}
          </span>
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {new Date().toLocaleDateString("en-IN", {
              weekday: "short",
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card glow-accent">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-text-secondary">Cash remaining</span>
            <div className="rounded-lg bg-accent-muted p-2">
              <IndianRupee className="h-4 w-4 text-accent" />
            </div>
          </div>
          <p className="text-2xl font-bold text-text-primary tabular-nums break-words">
            {formatCurrency(portfolio.balance)}
          </p>
          <p className="text-xs text-text-tertiary mt-1">Available to buy</p>
          <Link
            href="/paper-trading"
            className="text-xs text-accent hover:underline mt-2 inline-block"
          >
            Paper trading →
          </Link>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-text-secondary">Invested</span>
            <div className="rounded-lg bg-bg-tertiary p-2">
              <Wallet className="h-4 w-4 text-text-secondary" />
            </div>
          </div>
          <p className="text-2xl font-bold text-text-primary tabular-nums break-words">
            {formatCurrency(invested)}
          </p>
          <p className="text-xs text-text-tertiary mt-1 leading-relaxed">
            Cost of open holdings
            {invested > 0 && (
              <>
                <br />
                Mkt value {formatCurrency(portfolio.currentValue)}
              </>
            )}
          </p>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-text-secondary">Realized P&amp;L</span>
            <div className="rounded-lg bg-bg-tertiary p-2">
              {realizedPnl >= 0 ? (
                <TrendingUp className="h-4 w-4 text-profit" />
              ) : (
                <TrendingDown className="h-4 w-4 text-loss" />
              )}
            </div>
          </div>
          <p
            className={cn(
              "text-2xl font-bold tabular-nums break-words",
              realizedPnl >= 0 ? "text-profit" : "text-loss"
            )}
          >
            {formatCurrency(realizedPnl)}
          </p>
          <div className="flex items-center gap-1 mt-1">
            {isProfit ? (
              <ArrowUpRight className="h-3.5 w-3.5 text-profit" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5 text-loss" />
            )}
            <span className={cn("text-sm font-medium", isProfit ? "text-profit" : "text-loss")}>
              {formatPercent(allTimePnlPercent)}
            </span>
            <span className="text-xs text-text-tertiary ml-1">vs start</span>
          </div>
          <p className="text-xs text-text-tertiary mt-1">
            Matched closed lots (FIFO)
          </p>
        </div>
      </div>

      <MarketTrendHero marketOpen={marketOpen} />
      <SectorPerformanceChart marketOpen={marketOpen} />

      <div className="card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Portfolio Performance
            </h2>
            <p className="text-sm text-text-secondary">
              {chartHasData
                ? portfolioChartPeriodLabel(chartPeriod)
                : "Start trading to see performance"}
            </p>
          </div>
          <div
            className="flex w-full sm:w-auto items-center gap-1 rounded-lg bg-bg-tertiary p-1"
            role="tablist"
            aria-label="Portfolio performance period"
          >
            {([
              ["week", "Week"],
              ["month", "Month"],
              ["year", "Year"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={chartPeriod === value}
                onClick={() => setChartPeriod(value)}
                className={cn(
                  "flex-1 sm:flex-none rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  chartPeriod === value
                    ? "bg-bg-elevated text-text-primary shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {chartHasData && (
          <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border/60 bg-bg-secondary/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-text-tertiary">Trades</p>
              <p className="text-sm font-semibold tabular-nums text-text-primary">
                {chartPeriodTotals.tradeCount}
              </p>
              <p className="text-[11px] text-text-tertiary">
                {chartPeriodTotals.buyCount} buy · {chartPeriodTotals.sellCount} sell
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-bg-secondary/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-text-tertiary">Total traded</p>
              <p className="text-sm font-semibold tabular-nums text-text-primary">
                {formatCurrency(chartPeriodTotals.totalTurnover)}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-bg-secondary/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-text-tertiary">Realized P&amp;L</p>
              <p
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  chartPeriodTotals.realizedPnl >= 0 ? "text-profit" : "text-loss"
                )}
              >
                {chartPeriodTotals.realizedPnl >= 0 ? "+" : ""}
                {formatCurrency(chartPeriodTotals.realizedPnl)}
              </p>
              <p className="text-[11px] text-text-tertiary">
                {chartPeriodTotals.wins}W / {chartPeriodTotals.losses}L
                {chartPeriodTotals.winRate > 0 ? ` · ${chartPeriodTotals.winRate}%` : ""}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-bg-secondary/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-text-tertiary">Fees</p>
              <p className="text-sm font-semibold tabular-nums text-text-primary">
                {formatCurrency(chartPeriodTotals.fees)}
              </p>
              {chartPeriodTotals.feesEstimated && (
                <p className="text-[11px] text-text-tertiary">est. Zerodha schedule</p>
              )}
            </div>
          </div>
        )}
        <div className="h-72">
          {chartHasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <defs>
                  <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={isProfit ? "#10b981" : "#ef4444"} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={isProfit ? "#10b981" : "#ef4444"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#595959", fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#595959", fontSize: 11 }}
                  tickFormatter={(v: number) => `₹${(v / 100000).toFixed(1)}L`}
                  domain={[chartMin, chartMax]}
                  width={60}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={isProfit ? "#10b981" : "#ef4444"}
                  strokeWidth={2}
                  fill="url(#portfolioGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <BarChart3 className="h-12 w-12 text-text-tertiary mb-3 opacity-50" />
              <p className="text-sm text-text-secondary">No trading activity yet</p>
              <p className="text-xs text-text-tertiary mt-1">
                Place trades in{" "}
                <Link href="/paper-trading" className="text-accent hover:underline">
                  Paper Trading
                </Link>{" "}
                to see your portfolio chart
              </p>
            </div>
          )}
        </div>
      </div>

      <PaperHealthStrip />
    </div>
  );
}
