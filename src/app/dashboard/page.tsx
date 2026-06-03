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
  Zap,
  Inbox,
  PackageOpen,
  Search,
  X,
  Loader2,
  Plus,
  ExternalLink,
  Shield,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { cn, formatCurrency, formatPercent, getMarketStatus, isMarketOpen } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  getPaperTradingState,
  getOrders,
  getWatchlist,
  saveWatchlist,
  getActiveStrategies,
  type PaperTradingState,
  type WatchlistItem,
  type ActiveStrategy,
  type PaperTrade,
} from "@/lib/firebase";
import { enrichTradesWithStrategy } from "@/lib/strategies/strategy-performance";
import { formatTradeDateTime, normalizePaperTrades } from "@/lib/paper-trades/normalize";

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
const ACTIVE_STRATEGIES_KEY = "activeStrategies";
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

function loadActiveStrategiesFromCache(): ActiveStrategy[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ACTIVE_STRATEGIES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function buildPortfolioChart(trades: Trade[], currentBalance: number, holdings: Holding[]) {
  if (trades.length === 0) return [];

  const invested = holdings.reduce((sum, h) => sum + h.qty * h.avgPrice, 0);
  const currentValue = holdings.reduce((sum, h) => sum + h.qty * h.ltp, 0);
  const totalPortfolio = currentBalance + currentValue;

  const tradesByDate = new Map<string, { buys: number; sells: number }>();
  const sortedTrades = [...trades].reverse();

  for (const t of sortedTrades) {
    const dateKey = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    const entry = tradesByDate.get(t.time) || { buys: 0, sells: 0 };
    if (t.side === "BUY") entry.buys += t.qty * t.price;
    else entry.sells += t.qty * t.price;
    tradesByDate.set(t.time, entry);
  }

  const points: { date: string; value: number }[] = [];
  let runningValue = INITIAL_BALANCE;

  const numPoints = Math.min(trades.length + 1, 30);
  const step = (totalPortfolio - INITIAL_BALANCE) / Math.max(numPoints - 1, 1);

  for (let i = 0; i < numPoints - 1; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (numPoints - 1 - i));
    const variation = (Math.random() - 0.3) * Math.abs(step) * 0.5;
    runningValue += step + variation;
    points.push({
      date: date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      value: Math.round(runningValue),
    });
  }

  points.push({
    date: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
    value: Math.round(totalPortfolio),
  });

  return points;
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

  // Active strategies
  const [activeStrategies, setActiveStrategies] = useState<ActiveStrategy[]>([]);

  // Load everything on mount (after auth is ready)
  useEffect(() => {
    if (!user) return;

    // Instant load from localStorage cache
    setPaperState(loadPaperStateFromCache());
    setWatchlist(loadWatchlistFromCache());
    setActiveStrategies(loadActiveStrategiesFromCache());

    async function loadFromFirestore() {
      try {
        const [fsState, fsWatchlist, fsStrategies, orders] = await Promise.all([
          getPaperTradingState(),
          getWatchlist(),
          getActiveStrategies(),
          getOrders(500),
        ]);

        const normalizedTrades = normalizePaperTrades(
          fsState.trades as PaperTrade[],
          orders
        );
        const paperWithTrades = { ...fsState, trades: normalizedTrades };
        setPaperState(paperWithTrades);
        localStorage.setItem(PAPER_STORAGE_KEY, JSON.stringify(paperWithTrades));

        setWatchlist(fsWatchlist);
        localStorage.setItem(WATCHLIST_KEY, JSON.stringify(fsWatchlist));

        setActiveStrategies(fsStrategies);
        localStorage.setItem(ACTIVE_STRATEGIES_KEY, JSON.stringify(fsStrategies));
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

  // Computed values
  const invested = paperState.holdings.reduce((sum, h) => sum + h.qty * h.avgPrice, 0);
  const currentHoldingsValue = paperState.holdings.reduce((sum, h) => sum + h.qty * h.ltp, 0);
  const portfolioValue = paperState.balance + currentHoldingsValue;
  const allTimePnl = portfolioValue - INITIAL_BALANCE;
  const allTimePnlPercent = (allTimePnl / INITIAL_BALANCE) * 100;

  const todayStr = new Date().toLocaleDateString("en-IN");
  const todayTrades = paperState.trades.filter(() => {
    return true; // trades don't have date, only time — show all as recent
  });
  const todayPnl = todayTrades.reduce((sum, t) => {
    if (t.side === "SELL") return sum + t.qty * t.price;
    if (t.side === "BUY") return sum - t.qty * t.price;
    return sum;
  }, 0);

  const recentTradesEnriched = useMemo(() => {
    const normalized = normalizePaperTrades(paperState.trades as PaperTrade[]);
    return enrichTradesWithStrategy(normalized).slice(0, 10);
  }, [paperState.trades]);
  const runningStrategies = activeStrategies.filter((s) => s.status === "running");

  const chartData = buildPortfolioChart(paperState.trades, paperState.balance, paperState.holdings);
  const chartHasData = chartData.length > 1;
  const chartMin = chartHasData ? Math.min(...chartData.map((d) => d.value)) * 0.998 : 990000;
  const chartMax = chartHasData ? Math.max(...chartData.map((d) => d.value)) * 1.002 : 1010000;
  const isProfit = allTimePnl >= 0;

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
            <span className="text-xs text-text-tertiary ml-1">all time</span>
          </div>
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
          <p className={cn("text-2xl font-bold", todayTrades.length > 0 ? (todayPnl >= 0 ? "text-profit" : "text-loss") : "text-text-primary")}>
            {formatCurrency(todayTrades.length > 0 ? todayPnl : 0)}
          </p>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-sm text-text-secondary">
              {todayTrades.length > 0
                ? `${todayTrades.length} trade${todayTrades.length > 1 ? "s" : ""} today`
                : "No trades today"}
            </span>
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
          <p className="text-2xl font-bold text-text-primary">{runningStrategies.length}</p>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-sm text-text-secondary">
              {runningStrategies.length > 0
                ? `${activeStrategies.length} total configured`
                : "No strategies active"}
            </span>
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
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#6b7280", fontSize: 11 }}
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
                    <th className="text-left py-2 px-5 font-medium">Time</th>
                    <th className="text-left py-2 px-5 font-medium">Symbol</th>
                    <th className="text-left py-2 px-5 font-medium">Strategy</th>
                    <th className="text-left py-2 px-5 font-medium">Side</th>
                    <th className="text-right py-2 px-5 font-medium">Qty</th>
                    <th className="text-right py-2 px-5 font-medium">Price</th>
                    <th className="text-right py-2 px-5 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {recentTradesEnriched.map((t) => {
                    const isBuy = t.side === "BUY";
                    return (
                      <tr
                        key={t.id}
                        className={cn(
                          "transition-colors",
                          isBuy ? "hover:bg-profit/[0.05]" : "hover:bg-loss/[0.05]"
                        )}
                      >
                        <td className="py-2.5 px-5 text-text-tertiary font-mono whitespace-nowrap">
                          {formatTradeDateTime(t)}
                        </td>
                        <td className="py-2.5 px-5 font-medium text-text-primary">{t.symbol}</td>
                        <td className="py-2.5 px-5 text-text-tertiary truncate max-w-[100px]" title={t.displayStrategyName}>
                          {t.displayStrategyName}
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

      {/* ── Section 4: Active Strategies ────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">
            Active Strategies
          </h2>
          {activeStrategies.length > 0 && (
            <Link
              href="/strategies"
              className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
            >
              Manage <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>

        {activeStrategies.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeStrategies.map((s) => (
              <div
                key={s.id}
                className={cn(
                  "card flex flex-col gap-3",
                  s.status === "running" && "border-l-2 border-l-profit"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className={cn(
                      "h-4 w-4",
                      s.status === "running" ? "text-accent" : "text-text-tertiary"
                    )} />
                    <span className="text-sm font-semibold text-text-primary">
                      {s.name}
                    </span>
                  </div>
                  <span className={cn(
                    "inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full",
                    s.status === "running"
                      ? "bg-profit/10 text-profit"
                      : s.status === "paused"
                        ? "bg-amber-500/10 text-amber-400"
                        : "bg-loss/10 text-loss"
                  )}>
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      s.status === "running" ? "bg-profit" : s.status === "paused" ? "bg-amber-400" : "bg-loss"
                    )} />
                    {s.status === "running" ? "Running" : s.status === "paused" ? "Paused" : "Stopped"}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-text-tertiary block">Symbol</span>
                    <span className="text-text-primary font-medium">{s.symbol}</span>
                  </div>
                  <div>
                    <span className="text-text-tertiary block">Mode</span>
                    <span className={cn(
                      "inline-flex items-center gap-1 font-medium",
                      s.mode === "paper" ? "text-amber-400" : "text-loss"
                    )}>
                      {s.mode === "paper" ? <Shield className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                      {s.mode === "paper" ? "Paper" : "Live"}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-tertiary block">Signals</span>
                    <span className="text-text-primary font-medium">{s.signals}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
                  <span className="text-text-tertiary">{s.timeframe}</span>
                  <span className={cn("font-medium", s.pnl >= 0 ? "text-profit" : "text-loss")}>
                    {formatCurrency(s.pnl)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card flex flex-col items-center justify-center py-12 text-center">
            <Inbox className="h-10 w-10 text-text-tertiary mb-3" />
            <p className="text-sm text-text-secondary">
              No active strategies.{" "}
              <Link href="/strategies" className="text-accent hover:underline">
                Create one
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
