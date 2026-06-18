"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  IndianRupee,
  Activity,
  BarChart3,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Inbox,
  PackageOpen,
  Search,
  X,
  Loader2,
  Plus,
  ExternalLink,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { cn, formatCurrency, formatPercent, getMarketStatus, isMarketOpen, tableDateTimeThClass, tableDateTimeTdClass } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  getPaperTradingState,
  getOrders,
  getWatchlist,
  saveWatchlist,
  getSettings,
  type WatchlistItem,
  type PaperTrade,
} from "@/lib/firebase";
import { enrichTradesWithStrategy } from "@/lib/strategies/strategy-performance";
import { formatTradeDateTime, formatTradeDateTimeCompact, normalizePaperTrades, tradeExecutedAtMs } from "@/lib/paper-trades/normalize";
import { useTableSort } from "@/hooks/use-table-sort";
import SortableTh from "@/components/ui/sortable-th";
import { refreshHoldingsLtpClient } from "@/lib/market-data/refresh-holdings-ltp";
import { loadSettingsFromCache } from "@/lib/settings/cache";
import {
  buildPortfolioChart,
  computePnlBreakdown,
} from "@/lib/portfolio/compute-portfolio";
import PaperHealthPanel from "@/components/paper-health-panel";
import StrategyBadges from "@/components/strategy-badges";

// ── Types ────────────────────────────────────────────────────────────────

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
  strategyId?: string;
  strategyName?: string;
  reason?: string;
}

interface PaperState {
  balance: number;
  holdings: Holding[];
  trades: Trade[];
}

interface WatchlistQuote extends WatchlistItem {
  ltp: number | null;
  change: number | null;
  changePercent: number | null;
}

interface InstrumentResult {
  tradingsymbol: string;
  name: string;
  exchange: string;
  instrument_type: string;
}

// ── Constants ────────────────────────────────────────────────────────────

const PAPER_STORAGE_KEY = "paper_trading_state";
const WATCHLIST_KEY = "dashboard_watchlist";
const INITIAL_BALANCE = 1000000;
const REFRESH_INTERVAL = 15_000;

const POPULAR_STOCKS = [
  "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
  "HINDUNILVR", "ITC", "SBIN", "BHARTIARTL", "KOTAKBANK",
  "LT", "AXISBANK", "MARUTI", "BAJFINANCE", "TITAN",
];

// ── Helpers (localStorage fallbacks) ─────────────────────────────────────

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

function loadWatchlistFromCache(): WatchlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [];
}

// ── Custom Tooltip ───────────────────────────────────────────────────────

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

// ── Page ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const marketOpen = isMarketOpen();
  const marketStatus = getMarketStatus();

  // Paper trading state
  const [paperState, setPaperState] = useState<PaperState>({ balance: INITIAL_BALANCE, holdings: [], trades: [] });
  const [startingBalance, setStartingBalance] = useState(INITIAL_BALANCE);

  // Watchlist
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [watchlistQuotes, setWatchlistQuotes] = useState<Map<string, WatchlistQuote>>(new Map());
  const [watchlistSearch, setWatchlistSearch] = useState("");
  const [searchResults, setSearchResults] = useState<InstrumentResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Zerodha connection
  const [zerodhaConnected, setZerodhaConnected] = useState(false);

  // Load everything on mount (after auth is ready)
  useEffect(() => {
    if (!user) return;

    // Instant load from localStorage cache
    setPaperState(loadPaperStateFromCache());
    setWatchlist(loadWatchlistFromCache());
    const cachedSettings = loadSettingsFromCache();
    setStartingBalance(cachedSettings.paperStartingBalance ?? INITIAL_BALANCE);

    async function loadFromFirestore() {
      try {
        const [fsState, fsWatchlist, orders, fsSettings] = await Promise.all([
          getPaperTradingState(),
          getWatchlist(),
          getOrders(500),
          getSettings(),
        ]);

        setStartingBalance(fsSettings.paperStartingBalance ?? INITIAL_BALANCE);

        const normalizedTrades = normalizePaperTrades(
          fsState.trades as PaperTrade[],
          orders
        );
        const paperWithTrades = { ...fsState, trades: normalizedTrades };
        setPaperState(paperWithTrades);
        localStorage.setItem(PAPER_STORAGE_KEY, JSON.stringify(paperWithTrades));

        setWatchlist(fsWatchlist);
        localStorage.setItem(WATCHLIST_KEY, JSON.stringify(fsWatchlist));
      } catch (e) {
        console.error("Failed to load from Firestore, using localStorage cache:", e);
      }
    }

    async function checkZerodha() {
      try {
        const res = await fetch("/api/zerodha/accounts");
        const data = await res.json();
        const hasConnected = (data.accounts || []).some((a: any) => a.connected);
        setZerodhaConnected(hasConnected);
      } catch {
        setZerodhaConnected(false);
      }
    }

    loadFromFirestore();
    checkZerodha();
    setMounted(true);
  }, [user]);

  // Fetch watchlist quotes
  const fetchWatchlistQuotes = useCallback(async (items: WatchlistItem[]) => {
    if (items.length === 0) return;

    const newQuotes = new Map<string, WatchlistQuote>();
    for (const item of items) {
      try {
        const res = await fetch(
          `/api/market/quote?symbol=${encodeURIComponent(item.symbol)}&exchange=${item.exchange}`
        );
        if (res.ok) {
          const data = await res.json();
          newQuotes.set(item.symbol, {
            ...item,
            ltp: data.lastPrice ?? null,
            change: data.change ?? null,
            changePercent: data.changePercent ?? null,
          });
        } else {
          newQuotes.set(item.symbol, { ...item, ltp: null, change: null, changePercent: null });
        }
      } catch {
        newQuotes.set(item.symbol, { ...item, ltp: null, change: null, changePercent: null });
      }
    }
    setWatchlistQuotes(newQuotes);
  }, []);

  // Fetch quotes when watchlist changes or zerodha connects
  useEffect(() => {
    if (!mounted) return;
    fetchWatchlistQuotes(watchlist);
  }, [watchlist, mounted, fetchWatchlistQuotes]);

  // Auto-refresh prices when market is open
  useEffect(() => {
    if (!mounted || !marketOpen || watchlist.length === 0) return;
    const interval = setInterval(() => fetchWatchlistQuotes(watchlist), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [mounted, marketOpen, watchlist, fetchWatchlistQuotes]);

  const holdingsRef = useRef(paperState.holdings);
  holdingsRef.current = paperState.holdings;

  const holdingsRefreshKey = paperState.holdings
    .map((h) => `${h.symbol}:${h.qty}:${h.avgPrice}`)
    .join("|");

  // Refresh holdings LTP during market hours only (avoids flicker when closed)
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

  // Watchlist search
  const handleSearchChange = (value: string) => {
    setWatchlistSearch(value);
    setShowSearchResults(true);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!value.trim()) {
      setSearchResults([]);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/zerodha/instruments?search=${encodeURIComponent(value)}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setSearchResults(data.slice(0, 10));
            setIsSearching(false);
            return;
          }
        }
      } catch {}

      const filtered = POPULAR_STOCKS
        .filter((s) => s.includes(value.toUpperCase()))
        .map((s) => ({ tradingsymbol: s, name: s, exchange: "NSE", instrument_type: "EQ" }));
      setSearchResults(filtered);
      setIsSearching(false);
    }, 300);
  };

  const addToWatchlist = (instrument: InstrumentResult) => {
    const newItem: WatchlistItem = { symbol: instrument.tradingsymbol, exchange: instrument.exchange || "NSE" };
    if (watchlist.some((w) => w.symbol === newItem.symbol)) return;
    const updated = [...watchlist, newItem];
    setWatchlist(updated);
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(updated));
    saveWatchlist(updated);
    setWatchlistSearch("");
    setShowSearchResults(false);
    setSearchResults([]);

    if (zerodhaConnected) {
      fetchWatchlistQuotes(updated);
    }
  };

  const removeFromWatchlist = (symbol: string) => {
    const updated = watchlist.filter((w) => w.symbol !== symbol);
    setWatchlist(updated);
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(updated));
    saveWatchlist(updated);
  };

  const normalizedTradesForPnl = normalizePaperTrades(
    paperState.trades as PaperTrade[]
  );
  const pnl = computePnlBreakdown(
    normalizedTradesForPnl,
    paperState.holdings,
    paperState.balance,
    startingBalance
  );
  const { portfolio, unrealizedPnl, realizedPnl, allTimePnl, allTimePnlPercent, today } =
    pnl;
  const portfolioValue = portfolio.portfolioValue;
  const invested = portfolio.invested;
  const todayPnl = today.pnl;
  const isProfit = allTimePnl >= 0;

  const recentTradesEnriched = useMemo(() => {
    const normalized = normalizePaperTrades(paperState.trades as PaperTrade[]);
    return enrichTradesWithStrategy(normalized);
  }, [paperState.trades]);

  const { sortKey, sortDir, toggleSort, sortRows } = useTableSort({
    key: "when",
    dir: "desc",
  });
  const displayedTrades = useMemo(() => {
    const sorted = sortRows(recentTradesEnriched, {
      when: (t) => tradeExecutedAtMs(t),
      symbol: (t) => t.symbol,
      strategy: (t) => t.displayStrategyName ?? "",
      side: (t) => t.side,
      qty: (t) => t.qty,
      price: (t) => t.price,
      total: (t) => t.qty * t.price,
    });
    return sorted.slice(0, 10);
  }, [recentTradesEnriched, sortRows]);

  const chartData = buildPortfolioChart(
    normalizedTradesForPnl,
    paperState.balance,
    paperState.holdings,
    startingBalance
  );
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
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

      {/* ── Section 1: Summary Cards ──────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Portfolio Value */}
        <div className="card glow-accent">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-text-secondary">Portfolio Value</span>
            <div className="rounded-lg bg-accent-muted p-2">
              <IndianRupee className="h-4 w-4 text-accent" />
            </div>
          </div>
          <p className="text-2xl font-bold text-text-primary">
            {formatCurrency(portfolioValue)}
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
            <span className="text-xs text-text-tertiary ml-1">realized</span>
          </div>
          {invested > 0 && (
            <p className="text-xs text-text-tertiary mt-1">
              Invested {formatCurrency(invested)} · Mkt {formatCurrency(portfolio.currentValue)}
            </p>
          )}
        </div>

        {/* Unrealized P&L (open positions) */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-text-secondary">Unrealized P&amp;L</span>
            <div className="rounded-lg bg-bg-tertiary p-2">
              {unrealizedPnl >= 0 ? (
                <TrendingUp className="h-4 w-4 text-profit" />
              ) : (
                <TrendingDown className="h-4 w-4 text-loss" />
              )}
            </div>
          </div>
          <p
            className={cn(
              "text-2xl font-bold",
              unrealizedPnl >= 0 ? "text-profit" : "text-loss"
            )}
          >
            {formatCurrency(unrealizedPnl)}
          </p>
          <p className="text-xs text-text-tertiary mt-1">
            Open positions · mark-to-market
            {!marketOpen && " · prices frozen after close"}
          </p>
        </div>

        {/* Realized P&L (closed trades) */}
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
              "text-2xl font-bold",
              realizedPnl >= 0 ? "text-profit" : "text-loss"
            )}
          >
            {formatCurrency(realizedPnl)}
          </p>
          <p className="text-xs text-text-tertiary mt-1">From closed sell trades</p>
        </div>

        {/* Today's P&L */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-text-secondary">Today&apos;s P&amp;L</span>
            <div className="rounded-lg bg-bg-tertiary p-2">
              {todayPnl >= 0 ? (
                <TrendingUp className="h-4 w-4 text-profit" />
              ) : (
                <TrendingDown className="h-4 w-4 text-loss" />
              )}
            </div>
          </div>
          <p
            className={cn(
              "text-2xl font-bold",
              today.tradeCount > 0 || today.mode === "unrealized"
                ? todayPnl >= 0
                  ? "text-profit"
                  : "text-loss"
                : "text-text-primary"
            )}
          >
            {formatCurrency(todayPnl)}
          </p>
          <p className="text-xs text-text-tertiary mt-1">
            {today.mode === "realized"
              ? `${today.tradeCount} trade${today.tradeCount !== 1 ? "s" : ""} closed today`
              : today.mode === "unrealized"
                ? "Unrealized (no sells today)"
                : today.tradeCount > 0
                  ? `${today.tradeCount} buy${today.tradeCount !== 1 ? "s" : ""} today`
                  : "No activity today"}
          </p>
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

      {/* ── Section 2: Portfolio Performance Chart ──────────────────── */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Portfolio Performance
            </h2>
            <p className="text-sm text-text-secondary">
              {chartHasData ? "Based on trading activity" : "Start trading to see performance"}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary">
            <BarChart3 className="h-3.5 w-3.5" />
            Portfolio
          </div>
        </div>
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

      {/* ── Section 3: Watchlist & Recent Trades ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Watchlist */}
        <div className="card !p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="text-lg font-semibold text-text-primary">Watchlist</h2>
            <div className="flex items-center gap-2">
              {marketOpen && (
                <span className="flex items-center gap-1.5 text-[10px] text-profit" title="Prices via Yahoo Finance (~15 min delay)">
                  <span className="pulse-dot bg-profit" />
                  Market prices
                </span>
              )}
              <span className="text-xs text-text-tertiary">NSE</span>
            </div>
          </div>

          {/* Search bar */}
          <div className="px-5 pb-3 relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
              <input
                type="text"
                placeholder="Add stock to watchlist..."
                value={watchlistSearch}
                onChange={(e) => handleSearchChange(e.target.value.toUpperCase())}
                onFocus={() => { if (watchlistSearch) setShowSearchResults(true); }}
                onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-primary border border-border
                           text-text-primary placeholder:text-text-tertiary text-xs
                           focus:outline-none focus:border-accent transition-colors"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-accent animate-spin" />
              )}
            </div>

            {showSearchResults && searchResults.length > 0 && (
              <div className="absolute z-50 left-5 right-5 mt-1 bg-bg-elevated border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                {searchResults.map((item, i) => {
                  const alreadyAdded = watchlist.some((w) => w.symbol === item.tradingsymbol);
                  return (
                    <button
                      key={`${item.tradingsymbol}-${i}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => !alreadyAdded && addToWatchlist(item)}
                      disabled={alreadyAdded}
                      className={cn(
                        "w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between",
                        alreadyAdded ? "opacity-50 cursor-not-allowed" : "hover:bg-bg-hover cursor-pointer"
                      )}
                    >
                      <div>
                        <span className="text-text-primary font-medium">{item.tradingsymbol}</span>
                        {item.name && item.name !== item.tradingsymbol && (
                          <span className="text-text-tertiary ml-2">{item.name}</span>
                        )}
                      </div>
                      {alreadyAdded ? (
                        <span className="text-text-tertiary">Added</span>
                      ) : (
                        <Plus className="h-3.5 w-3.5 text-accent" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Watchlist items */}
          {watchlist.length > 0 ? (
            <div className="divide-y divide-border">
              {watchlist.map((item) => {
                const quote = watchlistQuotes.get(item.symbol);
                const hasQuote = quote && quote.ltp !== null;
                const isUp = hasQuote && (quote.changePercent ?? 0) >= 0;

                return (
                  <div
                    key={item.symbol}
                    className="flex items-center justify-between px-5 py-3 hover:bg-bg-hover/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "w-1 h-8 rounded-full",
                          hasQuote ? (isUp ? "bg-profit" : "bg-loss") : "bg-text-tertiary"
                        )}
                      />
                      <div>
                        <p className="text-sm font-medium text-text-primary">{item.symbol}</p>
                        <p className="text-[10px] text-text-tertiary">{item.exchange}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {hasQuote ? (
                        <div className="text-right">
                          <p className="text-sm font-semibold text-text-primary">
                            {formatCurrency(quote.ltp!)}
                          </p>
                          <p className={cn("text-xs font-medium", isUp ? "text-profit" : "text-loss")}>
                            {(quote.change ?? 0) >= 0 ? "+" : ""}
                            {(quote.change ?? 0).toFixed(2)} ({formatPercent(quote.changePercent ?? 0)})
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-text-tertiary">—</span>
                      )}
                      <button
                        onClick={() => removeFromWatchlist(item.symbol)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-bg-tertiary transition-all"
                        title="Remove from watchlist"
                      >
                        <X className="h-3.5 w-3.5 text-text-tertiary hover:text-loss" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 px-5 text-center">
              <Inbox className="h-10 w-10 text-text-tertiary mb-3" />
              <p className="text-sm text-text-secondary">
                Add stocks to your watchlist to track them here.
              </p>
            </div>
          )}
        </div>

        {/* Recent Trades */}
        <div className="card !p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="text-lg font-semibold text-text-primary">Recent Trades</h2>
            {recentTradesEnriched.length > 0 && (
              <Link
                href="/paper-trading"
                className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
              >
                View All <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>

          {recentTradesEnriched.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-text-tertiary uppercase tracking-wider">
                    <SortableTh sortKey="when" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className={cn(tableDateTimeThClass, "text-text-tertiary uppercase tracking-wider")}>When</SortableTh>
                    <SortableTh sortKey="symbol" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="py-2 px-5 font-medium">Symbol</SortableTh>
                    <SortableTh sortKey="strategy" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="py-2 px-5 font-medium">Strategy</SortableTh>
                    <SortableTh sortKey="side" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="py-2 px-5 font-medium">Side</SortableTh>
                    <SortableTh sortKey="qty" activeKey={sortKey} direction={sortDir} onSort={toggleSort} align="right" className="py-2 px-5 font-medium">Qty</SortableTh>
                    <SortableTh sortKey="price" activeKey={sortKey} direction={sortDir} onSort={toggleSort} align="right" className="py-2 px-5 font-medium">Price</SortableTh>
                    <SortableTh sortKey="total" activeKey={sortKey} direction={sortDir} onSort={toggleSort} align="right" className="py-2 px-5 font-medium">Total</SortableTh>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {displayedTrades.map((t) => {
                    const isBuy = t.side === "BUY";
                    return (
                      <tr
                        key={t.id}
                        className={cn(
                          "transition-colors",
                          isBuy ? "hover:bg-profit/[0.05]" : "hover:bg-loss/[0.05]"
                        )}
                      >
                        <td
                          className={cn(tableDateTimeTdClass)}
                          title={formatTradeDateTime(t)}
                        >
                          {formatTradeDateTimeCompact(t)}
                        </td>
                        <td className="py-2.5 px-5 font-medium text-text-primary">{t.symbol}</td>
                        <td className="py-2.5 px-5">
                          <StrategyBadges
                            names={t.displayStrategyNames}
                            unknownCount={t.unknownStrategyCount}
                            size="sm"
                          />
                        </td>
                        <td className="py-2.5 px-5">
                          <span className={cn(
                            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold",
                            isBuy ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss"
                          )}>
                            {isBuy ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                            {t.side}
                          </span>
                        </td>
                        <td className="py-2.5 px-5 text-right text-text-secondary">{t.qty}</td>
                        <td className="py-2.5 px-5 text-right text-text-primary">{formatCurrency(t.price)}</td>
                        <td className="py-2.5 px-5 text-right text-text-primary font-medium">{formatCurrency(t.qty * t.price)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 px-5 text-center">
              <PackageOpen className="h-10 w-10 text-text-tertiary mb-3" />
              <p className="text-sm text-text-secondary">
                No trades yet.{" "}
                <Link href="/paper-trading" className="text-accent hover:underline">
                  Place your first order
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>

      <PaperHealthPanel />
    </div>
  );
}
