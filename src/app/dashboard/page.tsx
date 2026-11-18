"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { BarChart3, Clock } from "lucide-react";
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
import LiveTradingDashboardStrip from "@/components/dashboard/live-trading-strip";
import OnboardingChecklist from "@/components/dashboard/onboarding-checklist";
import WatchlistPanel from "@/components/dashboard/watchlist-panel";
import AttributionWidgets from "@/components/dashboard/attribution-widgets";
import BenchmarkWidget from "@/components/dashboard/benchmark-widget";
import PageHeader from "@/components/ui/page-header";
import PageShell, { ContentGrid, SectionLabel } from "@/components/ui/page-shell";
import Panel, { PanelHeader } from "@/components/ui/panel";
import EmptyState from "@/components/ui/empty-state";
import { SkeletonChart } from "@/components/ui/skeleton";
import { chartTokens } from "@/lib/ui/chart-tokens";
import ExecutiveSummaryButton from "@/components/reporting/executive-summary-button";
import MetricStrip from "@/components/ui/metric-strip";

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
      <PageShell>
        <SkeletonChart />
        <SkeletonChart />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Dashboard"
        subtitle="A calm overview of your simulated book, live Zerodha account, and market context."
        mode="neutral"
        padded={false}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium",
                marketOpen
                  ? "bg-profit-muted text-profit"
                  : "bg-bg-tertiary text-text-tertiary"
              )}
            >
              <span className={cn("pulse-dot", marketOpen ? "bg-profit" : "bg-text-tertiary")} />
              {marketStatus}
            </span>
            <span className="hidden sm:inline-flex items-center gap-2 text-sm text-text-secondary">
              <Clock className="h-4 w-4 text-text-tertiary" />
              {new Date().toLocaleDateString("en-IN", {
                weekday: "short",
                day: "2-digit",
                month: "short",
              })}
            </span>
            <ExecutiveSummaryButton />
          </div>
        }
      />

      <OnboardingChecklist />

      <section>
        <SectionLabel>Books</SectionLabel>
        <ContentGrid>
          <Panel tone="paper">
            <PanelHeader
              title="Paper"
              subtitle="Simulated capital"
              action={
                <Link
                  href="/paper-trading"
                  className="rounded-lg bg-mode-paper px-3 py-1.5 text-xs font-semibold text-white hover:bg-mode-paper-hover transition-colors"
                >
                  Open
                </Link>
              }
            />
            <MetricStrip
              items={[
                { label: "Cash", value: formatCurrency(portfolio.balance) },
                {
                  label: "Invested",
                  value: formatCurrency(invested),
                  sub:
                    invested > 0
                      ? `Mkt ${formatCurrency(portfolio.currentValue)}`
                      : undefined,
                },
                {
                  label: "Realized",
                  value: formatCurrency(realizedPnl),
                  sub: `${formatPercent(allTimePnlPercent)} vs start`,
                  tone: realizedPnl >= 0 ? "profit" : "loss",
                },
              ]}
            />
          </Panel>
          <LiveTradingDashboardStrip />
        </ContentGrid>
      </section>

      <section>
        <SectionLabel>Watchlist & attribution</SectionLabel>
        <ContentGrid cols="lg:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.15fr)]">
          <WatchlistPanel />
          <div className="flex flex-col gap-5 min-w-0">
            <BenchmarkWidget />
            <AttributionWidgets />
          </div>
        </ContentGrid>
      </section>

      <section>
        <SectionLabel>Market & equity</SectionLabel>
        <ContentGrid>
          <MarketTrendHero marketOpen={marketOpen} />
          <Panel className="flex flex-col">
            <PanelHeader
              title="Portfolio performance"
              subtitle={
                chartHasData
                  ? portfolioChartPeriodLabel(chartPeriod)
                  : "Simulated paper equity"
              }
              action={
                <div
                  className="flex items-center gap-1 rounded-xl bg-bg-tertiary p-1"
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
                        "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                        chartPeriod === value
                          ? "bg-bg-elevated text-text-primary shadow-sm"
                          : "text-text-secondary hover:text-text-primary"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              }
            />
            {chartHasData && (
              <MetricStrip
                className="mb-5"
                items={[
                  {
                    label: "Trades",
                    value: String(chartPeriodTotals.tradeCount),
                    sub: `${chartPeriodTotals.buyCount}B · ${chartPeriodTotals.sellCount}S`,
                  },
                  {
                    label: "Traded",
                    value: formatCurrency(chartPeriodTotals.totalTurnover),
                  },
                  {
                    label: "Realized",
                    value: formatCurrency(chartPeriodTotals.realizedPnl),
                    sub: `${chartPeriodTotals.wins}W/${chartPeriodTotals.losses}L`,
                    tone: chartPeriodTotals.realizedPnl >= 0 ? "profit" : "loss",
                  },
                  {
                    label: "Fees",
                    value: formatCurrency(chartPeriodTotals.fees),
                  },
                ]}
              />
            )}
            <div className="h-52 sm:h-60 flex-1 min-h-[13rem]">
              {chartHasData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor={isProfit ? chartTokens.profit : chartTokens.loss}
                          stopOpacity={0.28}
                        />
                        <stop
                          offset="95%"
                          stopColor={isProfit ? chartTokens.profit : chartTokens.loss}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: chartTokens.axis, fontSize: 11 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: chartTokens.axis, fontSize: 11 }}
                      tickFormatter={(v: number) => `₹${(v / 100000).toFixed(1)}L`}
                      domain={[chartMin, chartMax]}
                      width={54}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke={isProfit ? chartTokens.profit : chartTokens.loss}
                      strokeWidth={2}
                      fill="url(#portfolioGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  compact
                  icon={BarChart3}
                  title="No paper trades yet"
                  description="Run simulated trades to see equity here. No real money involved."
                  action={
                    <Link
                      href="/paper-trading"
                      className="rounded-xl border border-border bg-bg-secondary px-4 py-2 text-xs font-semibold text-text-primary hover:bg-bg-hover transition-colors"
                    >
                      Open paper trading
                    </Link>
                  }
                />
              )}
            </div>
          </Panel>
        </ContentGrid>
      </section>

      <section>
        <SectionLabel>Sectors</SectionLabel>
        <SectorPerformanceChart marketOpen={marketOpen} />
      </section>

      <PaperHealthStrip />
    </PageShell>
  );
}
