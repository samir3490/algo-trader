"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Plus,
  RefreshCw,
  IndianRupee,
  Loader2,
  X,
  LogOut,
  AlertCircle,
  BarChart3,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn, formatCurrency, formatPercent, formatNumber } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  getPaperTradingState,
  savePaperTradingState,
  resetPaperTrading,
  saveOrder,
  getOrders,
  getSettings,
  type AppSettings,
} from "@/lib/firebase";
import type { OrderRecord, PaperTrade } from "@/lib/firebase";
import { loadSettingsFromCache, saveSettingsToCache } from "@/lib/settings/cache";
import {
  applyPaperRiskExits,
  canPlacePaperBuy,
} from "@/lib/risk/paper-risk-guard";
import { applyPaperSignal } from "@/lib/strategies/execute-paper";
import { canExecuteStrategyTrade } from "@/lib/strategies/portfolio-gate";
import {
  computeZerodhaCharges,
  cashFlowForTrade,
} from "@/lib/brokerage/zerodha-charges";
import {
  enrichTradesWithStrategy,
  computeStrategyDetailBundles,
} from "@/lib/strategies/strategy-performance";
import {
  formatTradeDateTime,
  normalizePaperTrades,
  tradesNormalizedChanged,
} from "@/lib/paper-trades/normalize";
import { fetchMarketQuote } from "@/lib/market-data/fetch-quote-client";
import { refreshHoldingsLtpClient } from "@/lib/market-data/refresh-holdings-ltp";
import { computePortfolio } from "@/lib/portfolio/compute-portfolio";

type OrderSide = "BUY" | "SELL";
type OrderType = "MARKET" | "LIMIT";
type Exchange = "NSE" | "BSE";

interface Holding {
  symbol: string;
  exchange: Exchange;
  qty: number;
  avgPrice: number;
  ltp: number;
}

interface Trade {
  id: string;
  time: string;
  symbol: string;
  exchange: Exchange;
  side: OrderSide;
  qty: number;
  price: number;
  date?: string;
  executedAt?: string;
  strategyId?: string;
  strategyName?: string;
  reason?: string;
  product?: string;
  charges?: number;
  brokerage?: number;
  stt?: number;
  gst?: number;
  netPnl?: number;
  grossAmount?: number;
}

interface StockQuote {
  symbol: string;
  exchange: string;
  lastPrice: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  buyDepth: { price: number; quantity: number; orders: number }[];
  sellDepth: { price: number; quantity: number; orders: number }[];
  lowerCircuit: number;
  upperCircuit: number;
  totalBuyQty: number;
  totalSellQty: number;
}

interface InstrumentResult {
  tradingsymbol: string;
  name: string;
  exchange: string;
  instrument_type: string;
}

interface PaperState {
  balance: number;
  holdings: Holding[];
  trades: Trade[];
  cloudSyncedAtMs?: number;
}

const INITIAL_BALANCE = 1000000;
const STORAGE_KEY = "paper_trading_state";

function loadStateFromLocalStorage(): PaperState {
  if (typeof window === "undefined") {
    return { balance: INITIAL_BALANCE, holdings: [], trades: [] };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        balance: parsed.balance ?? INITIAL_BALANCE,
        holdings: parsed.holdings ?? [],
        trades: parsed.trades ?? [],
        cloudSyncedAtMs: parsed.cloudSyncedAtMs,
      };
    }
  } catch {}
  return { balance: INITIAL_BALANCE, holdings: [], trades: [] };
}

function saveStateToLocalStorage(state: PaperState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

const POPULAR_STOCKS = [
  "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
  "HINDUNILVR", "ITC", "SBIN", "BHARTIARTL", "KOTAKBANK",
  "LT", "AXISBANK", "MARUTI", "BAJFINANCE", "TITAN",
  "SUNPHARMA", "WIPRO", "HCLTECH", "TATAMOTORS", "TATASTEEL",
  "POWERGRID", "NTPC", "ONGC", "ADANIENT", "TECHM",
];

export default function PaperTradingPage() {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [balance, setBalance] = useState(INITIAL_BALANCE);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);

  const [orderSide, setOrderSide] = useState<OrderSide>("BUY");
  const [symbol, setSymbol] = useState("");
  const [exchange, setExchange] = useState<Exchange>("NSE");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [qty, setQty] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [manualPrice, setManualPrice] = useState("");

  const [zerodhaConnected, setZerodhaConnected] = useState(false);
  const [quoteAccountIds, setQuoteAccountIds] = useState<string[]>([]);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);

  const [searchResults, setSearchResults] = useState<InstrumentResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  const holdingsRef = useRef(holdings);
  holdingsRef.current = holdings;

  const [validationError, setValidationError] = useState("");
  const [orderHistory, setOrderHistory] = useState<OrderRecord[]>([]);
  const [expandedStrategyKey, setExpandedStrategyKey] = useState<string | null>(
    null
  );
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [riskToast, setRiskToast] = useState<string | null>(null);
  const settingsRef = useRef<AppSettings | null>(null);
  const balanceRef = useRef(balance);
  const tradesRef = useRef(trades);
  balanceRef.current = balance;
  tradesRef.current = trades;
  settingsRef.current = appSettings;

  const applyCloudState = useCallback((state: {
    balance: number;
    holdings: Holding[];
    trades: Trade[];
    cloudSyncedAtMs?: number;
  }) => {
    setBalance(state.balance);
    setHoldings(state.holdings as Holding[]);
    setTrades(state.trades as Trade[]);
    saveStateToLocalStorage({
      balance: state.balance,
      holdings: state.holdings as Holding[],
      trades: state.trades as Trade[],
      cloudSyncedAtMs: state.cloudSyncedAtMs ?? Date.now(),
    });
  }, []);

  const syncFromCloud = useCallback(async () => {
    if (!user) return;
    try {
      const [state, orders] = await Promise.all([
        getPaperTradingState(),
        getOrders(500),
      ]);
      setOrderHistory(orders);
      const rawTrades = (state.trades ?? []) as PaperTrade[];
      const normalized = normalizePaperTrades(rawTrades, orders);
      if (tradesNormalizedChanged(rawTrades, normalized)) {
        await savePaperTradingState({
          balance: state.balance,
          holdings: state.holdings,
          trades: normalized,
        });
      }
      applyCloudState({
        balance: state.balance,
        holdings: state.holdings as Holding[],
        trades: normalized as Trade[],
        cloudSyncedAtMs: state.cloudUpdatedAtMs ?? Date.now(),
      });
    } catch (e) {
      console.error("Firestore load failed:", e);
    }
  }, [user, applyCloudState]);

  useEffect(() => {
    const cached = loadStateFromLocalStorage();
    setBalance(cached.balance);
    setHoldings(cached.holdings);
    setTrades(cached.trades);
    setMounted(true);

    const cachedSettings = loadSettingsFromCache();
    setAppSettings(cachedSettings);
    setExchange((cachedSettings.defaultExchange as Exchange) || "NSE");
    setOrderType(
      (cachedSettings.defaultOrderType as OrderType) || "MARKET"
    );
    setQty(String(cachedSettings.defaultQuantity || 1));

    if (!user) return;
    syncFromCloud();
    getSettings()
      .then((s) => {
        setAppSettings(s);
        saveSettingsToCache(s);
        setExchange((s.defaultExchange as Exchange) || "NSE");
        setOrderType((s.defaultOrderType as OrderType) || "MARKET");
        if (!qty) setQty(String(s.defaultQuantity || 1));
      })
      .catch(() => {});
  }, [user, syncFromCloud]);

  // Cache LTP locally only — do NOT auto-upload to Firestore (would undo server strategy trades)
  useEffect(() => {
    if (!mounted) return;
    const cached = loadStateFromLocalStorage();
    saveStateToLocalStorage({
      balance,
      holdings,
      trades,
      cloudSyncedAtMs: cached.cloudSyncedAtMs,
    });
  }, [balance, holdings, trades, mounted]);

  useEffect(() => {
    if (!mounted || !user) return;
    window.addEventListener("paper-trading-updated", syncFromCloud);
    const onVisible = () => {
      if (document.visibilityState === "visible") syncFromCloud();
    };
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(syncFromCloud, 120_000);
    return () => {
      window.removeEventListener("paper-trading-updated", syncFromCloud);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, [mounted, user, syncFromCloud]);

  // Refresh LTP / P&L and run stop-loss / take-profit from Settings
  useEffect(() => {
    if (!mounted || holdings.length === 0) return;

    let cancelled = false;
    async function refreshLtps() {
      const updated = await refreshHoldingsLtpClient(holdingsRef.current);
      if (cancelled) return;

      const settings = settingsRef.current;
      if (settings?.autoStopLoss || settings?.autoTakeProfit) {
        const { state, exits } = applyPaperRiskExits(
          {
            balance: balanceRef.current,
            holdings: updated,
            trades: tradesRef.current as PaperTrade[],
          },
          settings
        );
        if (exits.length > 0) {
          setBalance(state.balance ?? balanceRef.current);
          setHoldings((state.holdings ?? []) as Holding[]);
          setTrades((state.trades ?? []) as Trade[]);
          savePaperTradingState(state).catch(() => {});
          const msg = exits
            .map((e) => `${e.symbol}: ${e.message}`)
            .join("; ");
          setRiskToast(`Risk exit: ${msg}`);
          setTimeout(() => setRiskToast(null), 8000);
          return;
        }
      }

      setHoldings(updated);
    }

    refreshLtps();
    const interval = setInterval(refreshLtps, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [mounted, holdings.length, appSettings?.autoStopLoss, appSettings?.autoTakeProfit]);

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/zerodha/accounts");
        const data = await res.json();
        const connectedList = (data.accounts || [])
          .filter((a: { connected: boolean }) => a.connected)
          .map((a: { kiteUserId: string }) => a.kiteUserId);
        setZerodhaConnected(connectedList.length > 0);
        setQuoteAccountIds(connectedList);
      } catch {
        setZerodhaConnected(false);
        setQuoteAccountIds([]);
      } finally {
        setIsCheckingAuth(false);
      }
    }
    checkAuth();
  }, []);

  const buildQuoteFromHolding = useCallback(
    (sym: string, ex: Exchange): StockQuote | null => {
      const holding = holdings.find(
        (h) => h.symbol.toUpperCase() === sym.toUpperCase() && h.exchange === ex
      );
      if (!holding || !holding.ltp) return null;
      const change = holding.ltp - holding.avgPrice;
      const changePercent = holding.avgPrice > 0 ? (change / holding.avgPrice) * 100 : 0;
      return {
        symbol: holding.symbol,
        exchange: holding.exchange,
        lastPrice: holding.ltp,
        open: holding.ltp,
        high: holding.ltp,
        low: holding.ltp,
        close: holding.avgPrice,
        volume: 0,
        change,
        changePercent,
        buyDepth: [],
        sellDepth: [],
        lowerCircuit: 0,
        upperCircuit: 0,
        totalBuyQty: 0,
        totalSellQty: 0,
      };
    },
    [holdings]
  );

  const fetchQuote = useCallback(
    async (sym: string, ex: Exchange) => {
      if (!sym.trim()) return;
      setIsLoadingQuote(true);
      try {
        const data = await fetchMarketQuote(sym.trim(), ex);
        if (data?.lastPrice && data.lastPrice > 0) {
          setQuote({
            ...data,
            buyDepth: data.buyDepth ?? [],
            sellDepth: data.sellDepth ?? [],
            lowerCircuit: data.lowerCircuit ?? 0,
            upperCircuit: data.upperCircuit ?? 0,
            totalBuyQty: data.totalBuyQty ?? 0,
            totalSellQty: data.totalSellQty ?? 0,
          });
          return;
        }

        const fallback = buildQuoteFromHolding(sym.trim(), ex);
        setQuote(fallback);
        if (!fallback) setQuote(null);
      } catch {
        const fallback = buildQuoteFromHolding(sym.trim(), ex);
        setQuote(fallback);
      } finally {
        setIsLoadingQuote(false);
      }
    },
    [buildQuoteFromHolding]
  );

  const searchInstruments = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      const filtered = POPULAR_STOCKS
        .filter((s) => s.startsWith(query.toUpperCase()))
        .map((s) => ({ tradingsymbol: s, name: s, exchange: "NSE", instrument_type: "EQ" }));
      setSearchResults(filtered);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(
        `/api/zerodha/instruments?search=${encodeURIComponent(query)}&exchange=${exchange}`
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setSearchResults(data.slice(0, 15));
          setIsSearching(false);
          return;
        }
      }
    } catch {}

    const filtered = POPULAR_STOCKS
      .filter((s) => s.includes(query.toUpperCase()))
      .map((s) => ({ tradingsymbol: s, name: s, exchange: "NSE", instrument_type: "EQ" }));
    setSearchResults(filtered);
    setIsSearching(false);
  }, [exchange]);

  const handleSymbolChange = (value: string) => {
    setSymbol(value);
    setValidationError("");
    setShowSuggestions(true);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      searchInstruments(value);
    }, 300);
  };

  const handleSelectSymbol = (instrument: InstrumentResult) => {
    setSymbol(instrument.tradingsymbol);
    setShowSuggestions(false);
    setSearchResults([]);
    fetchQuote(instrument.tradingsymbol, exchange);
  };

  useEffect(() => {
    if (!symbol.trim()) return;
    const timer = setTimeout(() => fetchQuote(symbol.trim(), exchange), 800);
    return () => clearTimeout(timer);
  }, [exchange, fetchQuote, symbol]);

  const getOrderPrice = (): number | null => {
    if (orderType === "LIMIT") {
      const lp = parseFloat(limitPrice);
      return lp > 0 ? lp : null;
    }
    if (quote && zerodhaConnected) {
      return quote.lastPrice;
    }
    const mp = parseFloat(manualPrice);
    return mp > 0 ? mp : null;
  };

  const estimatedPrice = getOrderPrice();
  const estimatedCost = useMemo(() => {
    const qtyNum = parseInt(qty || "0", 10);
    if (!estimatedPrice || !qtyNum || qtyNum <= 0) return null;
    const turnover = estimatedPrice * qtyNum;
    if (!appSettings?.simulateBrokerage) return turnover;
    const product = appSettings.paperDefaultProduct ?? "CNC";
    const charges = computeZerodhaCharges({
      side: orderSide,
      qty: qtyNum,
      price: estimatedPrice,
      product,
    });
    return orderSide === "BUY"
      ? cashFlowForTrade("BUY", turnover, charges)
      : turnover - charges.total;
  }, [estimatedPrice, qty, orderSide, appSettings?.simulateBrokerage, appSettings?.paperDefaultProduct]);

  function handlePlaceOrder() {
    setValidationError("");
    const qtyNum = parseInt(qty);
    if (!symbol.trim()) {
      setValidationError("Please enter a symbol");
      return;
    }
    if (!qtyNum || qtyNum <= 0) {
      setValidationError("Please enter a valid quantity");
      return;
    }

    const price = getOrderPrice();
    if (!price || price <= 0) {
      setValidationError(
        orderType === "LIMIT"
          ? "Please enter a valid limit price"
          : zerodhaConnected
            ? "Unable to fetch market price. Try again or use LIMIT order."
            : "Please enter a price manually"
      );
      return;
    }

    const sym = symbol.toUpperCase().trim();

    if (appSettings) {
      const gate = canExecuteStrategyTrade(orderSide, sym, exchange, {
        holdings: holdings.map((h) => ({
          symbol: h.symbol,
          exchange: h.exchange,
          qty: h.qty,
          avgPrice: h.avgPrice,
          ltp: h.ltp,
        })),
        trades: trades as PaperTrade[],
        settings: appSettings,
        soldThisRun: new Set(),
      });
      if (!gate.allowed) {
        setValidationError(gate.reason ?? "Trade not allowed");
        return;
      }
      if (orderSide === "BUY") {
        const isNewPosition = !holdings.some(
          (h) => h.symbol === sym && h.exchange === exchange
        );
        const buyCheck = canPlacePaperBuy({
          balance,
          orderValue: price * qtyNum,
          holdingsCount: isNewPosition ? holdings.length + 1 : holdings.length,
          settings: appSettings,
        });
        if (!buyCheck.allowed) {
          setValidationError(buyCheck.message ?? "Buy not allowed");
          return;
        }
      }
    }

    const { state, executed, message } = applyPaperSignal(
      { balance, holdings, trades: trades as PaperTrade[] },
      {
        symbol: sym,
        action: orderSide,
        price,
        quantity: qtyNum,
        reason: "Manual order",
        confidence: 1,
        timestamp: new Date(),
      },
      exchange,
      { strategyName: "Manual" },
      {
        simulateBrokerage: appSettings?.simulateBrokerage,
        product: appSettings?.paperDefaultProduct ?? "CNC",
      }
    );

    if (!executed) {
      setValidationError(message ?? "Order could not be executed");
      return;
    }

    const newTrade = state.trades?.[0] as Trade | undefined;
    if (!newTrade) {
      setValidationError("Order failed");
      return;
    }

    const merged = normalizePaperTrades(
      state.trades ?? [],
      orderHistory
    );
    setBalance(state.balance ?? balance);
    setHoldings((state.holdings ?? []) as Holding[]);
    setTrades(merged as Trade[]);
    saveStateToLocalStorage({
      balance: state.balance ?? balance,
      holdings: (state.holdings ?? []) as Holding[],
      trades: merged as Trade[],
      cloudSyncedAtMs: Date.now(),
    });
    savePaperTradingState({
      balance: state.balance,
      holdings: state.holdings,
      trades: merged,
    }).catch(() => {});

    setSymbol("");
    setQty("");
    setLimitPrice("");
    setManualPrice("");
    setQuote(null);
    setValidationError("");

    if (appSettings?.notifyOrders !== false && appSettings?.notifyEmailDigest === false) {
      fetch("/api/notify/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "PAPER",
          symbol: sym,
          exchange,
          side: orderSide,
          quantity: qtyNum,
          price,
          orderType,
        }),
      }).catch(() => {});
    }

    saveOrder({
      id: newTrade.id,
      time: newTrade.time,
      symbol: sym,
      exchange,
      side: orderSide,
      qty: qtyNum,
      price,
      orderType,
      product: appSettings?.paperDefaultProduct ?? "CNC",
      mode: "PAPER",
      status: "EXECUTED",
      date: new Date().toISOString().split("T")[0],
    }).catch(() => {});
  }

  function handleExit(holding: Holding) {
    setOrderSide("SELL");
    setSymbol(holding.symbol);
    setExchange(holding.exchange);
    setQty(holding.qty.toString());
    setOrderType("MARKET");
    setManualPrice(holding.ltp.toString());
    setValidationError("");

    if (zerodhaConnected) {
      fetchQuote(holding.symbol, holding.exchange);
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleSquareOff(holding: Holding) {
    const price = holding.ltp;
    const totalValue = price * holding.qty;
    const sym = holding.symbol;

    const now = new Date();
    const executedAt = now.toISOString();
    const timeStr = now.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const dateStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

    const newTrade: Trade = {
      id: `t${Date.now()}`,
      time: timeStr,
      executedAt,
      symbol: sym,
      exchange: holding.exchange,
      side: "SELL",
      qty: holding.qty,
      price,
      date: dateStr,
    };

    const merged = normalizePaperTrades(
      [newTrade as PaperTrade, ...(trades as PaperTrade[])],
      orderHistory
    );
    const newBalance = balance + totalValue;
    const newHoldings = holdings.filter(
      (h) => !(h.symbol === sym && h.exchange === holding.exchange)
    );

    setTrades(merged as Trade[]);
    setBalance(newBalance);
    setHoldings(newHoldings);
    saveStateToLocalStorage({
      balance: newBalance,
      holdings: newHoldings,
      trades: merged as Trade[],
      cloudSyncedAtMs: Date.now(),
    });
    savePaperTradingState({
      balance: newBalance,
      holdings: newHoldings,
      trades: merged,
    }).catch(() => {});

    saveOrder({
      id: newTrade.id,
      time: newTrade.time,
      symbol: sym,
      exchange: holding.exchange,
      side: "SELL",
      qty: holding.qty,
      price,
      orderType: "MARKET",
      product: appSettings?.paperDefaultProduct ?? "CNC",
      mode: "PAPER",
      status: "EXECUTED",
      date: new Date().toISOString().split("T")[0],
    }).catch(() => {});
  }

  function handleReset() {
    setHoldings([]);
    setTrades([]);
    setBalance(INITIAL_BALANCE);
    setSymbol("");
    setQty("");
    setLimitPrice("");
    setManualPrice("");
    setOrderSide("BUY");
    setOrderType("MARKET");
    setQuote(null);
    setValidationError("");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    resetPaperTrading().catch(() => {});
  }

  const portfolio = computePortfolio(holdings, balance);

  const normalizedTrades = useMemo(
    () => normalizePaperTrades(trades as PaperTrade[], orderHistory),
    [trades, orderHistory]
  );
  const enrichedTrades = useMemo(
    () => enrichTradesWithStrategy(normalizedTrades),
    [normalizedTrades]
  );
  const strategyDetails = useMemo(
    () =>
      computeStrategyDetailBundles(
        normalizedTrades,
        holdings.map((h) => ({
          symbol: h.symbol,
          exchange: h.exchange,
          qty: h.qty,
          avgPrice: h.avgPrice,
          ltp: h.ltp,
        }))
      ),
    [normalizedTrades, holdings]
  );
  const holdingsNotInHistory = useMemo(() => {
    const traded = new Set(
      normalizedTrades.map(
        (t) => `${t.symbol.toUpperCase()}:${(t.exchange || "NSE").toUpperCase()}`
      )
    );
    return holdings.filter(
      (h) =>
        !traded.has(
          `${h.symbol.toUpperCase()}:${(h.exchange || "NSE").toUpperCase()}`
        )
    );
  }, [holdings, normalizedTrades]);
  const strategyTradeCount = useMemo(
    () => enrichedTrades.filter((t) => t.displayStrategyName !== "Manual").length,
    [enrichedTrades]
  );

  const summaryItems = [
    {
      label: "Balance",
      value: formatCurrency(portfolio.balance),
      icon: Wallet,
      color: "text-blue-400",
    },
    {
      label: "Invested",
      value: formatCurrency(portfolio.invested),
      icon: IndianRupee,
      color: "text-text-primary",
    },
    {
      label: "Current Value",
      value: formatCurrency(portfolio.currentValue),
      icon: TrendingUp,
      color: "text-cyan-400",
    },
    {
      label: "P&L",
      value: `${portfolio.pnl >= 0 ? "+" : ""}${formatCurrency(portfolio.pnl)} (${formatPercent(portfolio.pnlPercent)})`,
      icon: portfolio.pnl >= 0 ? ArrowUpRight : ArrowDownRight,
      color: portfolio.pnl >= 0 ? "text-profit" : "text-loss",
    },
  ];

  if (!mounted) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-text-tertiary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-text-primary">
              Paper Trading
            </h1>
            <p className="text-text-secondary mt-1 text-sm md:text-base">
              Practice trading with virtual money
              {zerodhaConnected ? " using real market data" : " — connect Zerodha for live prices"}
            </p>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-auto">
            {!isCheckingAuth && (
              <div className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border",
                zerodhaConnected
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-400"
              )}>
                <span className={cn(
                  "w-2 h-2 rounded-full",
                  zerodhaConnected ? "bg-emerald-400" : "bg-amber-400"
                )} />
                {zerodhaConnected ? "Live Prices" : "Manual Prices"}
              </div>
            )}
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-bg-tertiary border border-border
                         text-text-secondary hover:text-text-primary hover:border-border-light
                         transition-all duration-200 text-sm cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Reset Portfolio
            </button>
          </div>
        </div>

        {appSettings && (appSettings.autoStopLoss || appSettings.autoTakeProfit) && (
          <div className="mb-4 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-xs text-text-secondary">
            <span className="text-accent font-medium">Risk guard active: </span>
            {appSettings.autoStopLoss && (
              <span>stop loss at −{appSettings.stopLossPercent}%</span>
            )}
            {appSettings.autoStopLoss && appSettings.autoTakeProfit && " · "}
            {appSettings.autoTakeProfit && (
              <span>take profit at +{appSettings.takeProfitPercent}%</span>
            )}
            <span className="text-text-tertiary">
              {" "}
              · product {appSettings.paperDefaultProduct}
              · default qty {appSettings.defaultQuantity}
              {" "}
              <a href="/settings" className="text-accent hover:underline">Settings</a>
            </span>
          </div>
        )}

        {riskToast && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {riskToast}
          </div>
        )}

        {/* Portfolio Summary Bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {summaryItems.map((item) => (
            <div key={item.label} className="card flex items-center gap-3">
              <div className={cn("p-2 rounded-lg bg-bg-tertiary", item.color)}>
                <item.icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-text-tertiary uppercase tracking-wider">
                  {item.label}
                </p>
                <p className={cn("text-sm md:text-base font-semibold truncate", item.color)}>
                  {item.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-6">
        {/* Order Form + Quote Panel */}
        <div className="lg:col-span-1 space-y-4">
          {/* Order Form */}
          <div className="card">
            <h2 className="text-lg font-semibold text-text-primary mb-4">
              Place Order
            </h2>

            {/* BUY / SELL Tabs */}
            <div className="flex rounded-lg bg-bg-primary p-1 mb-5">
              {(["BUY", "SELL"] as const).map((side) => (
                <button
                  key={side}
                  onClick={() => { setOrderSide(side); setValidationError(""); }}
                  className={cn(
                    "flex-1 py-2 text-sm font-semibold rounded-md transition-all duration-200 cursor-pointer",
                    orderSide === side
                      ? side === "BUY"
                        ? "bg-profit text-white shadow-md"
                        : "bg-loss text-white shadow-md"
                      : "text-text-secondary hover:text-text-primary"
                  )}
                >
                  {side}
                </button>
              ))}
            </div>

            {/* Symbol Search */}
            <div className="mb-4 relative">
              <label className="block text-xs text-text-tertiary uppercase tracking-wider mb-1.5">
                Symbol
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                <input
                  type="text"
                  placeholder="Search stocks..."
                  value={symbol}
                  onChange={(e) => handleSymbolChange(e.target.value.toUpperCase())}
                  onFocus={() => {
                    setShowSuggestions(true);
                    if (!searchResults.length) searchInstruments(symbol);
                  }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  className="w-full pl-9 pr-9 py-2.5 rounded-lg bg-bg-primary border border-border
                             text-text-primary placeholder:text-text-tertiary text-sm
                             focus:outline-none focus:border-accent transition-colors"
                />
                {(isLoadingQuote || isSearching) && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-accent animate-spin" />
                )}
                {symbol && !isLoadingQuote && !isSearching && (
                  <button
                    onClick={() => { setSymbol(""); setQuote(null); setSearchResults([]); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Search Dropdown */}
              {showSuggestions && searchResults.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-bg-elevated border border-border rounded-lg shadow-xl max-h-52 overflow-y-auto">
                  {searchResults.map((item, i) => (
                    <button
                      key={`${item.tradingsymbol}-${i}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectSymbol(item)}
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-accent/10 transition-colors flex items-center justify-between"
                    >
                      <div>
                        <span className="text-text-primary font-medium">{item.tradingsymbol}</span>
                        {item.name && item.name !== item.tradingsymbol && (
                          <span className="text-text-tertiary text-xs ml-2">{item.name}</span>
                        )}
                      </div>
                      <span className="text-text-tertiary text-xs">{item.exchange}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected symbol price (quick view) */}
            {symbol.trim() && (
              <div className="mb-4 rounded-lg border border-border bg-bg-primary px-3 py-2.5 flex items-center justify-between">
                <span className="text-xs text-text-tertiary">{symbol} · {exchange}</span>
                {isLoadingQuote ? (
                  <span className="text-xs text-text-tertiary flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading price...
                  </span>
                ) : quote ? (
                  <div className="text-right">
                    <span className={cn("text-sm font-bold", quote.changePercent >= 0 ? "text-profit" : "text-loss")}>
                      {formatCurrency(quote.lastPrice)}
                    </span>
                    <span className={cn("text-xs ml-2", quote.changePercent >= 0 ? "text-profit/80" : "text-loss/80")}>
                      {quote.change >= 0 ? "+" : ""}{quote.change?.toFixed(2)} ({formatPercent(quote.changePercent)})
                    </span>
                  </div>
                ) : zerodhaConnected ? (
                  <span className="text-xs text-text-tertiary">Price unavailable</span>
                ) : (
                  <span className="text-xs text-amber-400/80">Connect Zerodha for live price</span>
                )}
              </div>
            )}

            {/* Exchange + Order Type + Product (from Settings) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              <div>
                <label className="block text-xs text-text-tertiary uppercase tracking-wider mb-1.5">
                  Exchange
                </label>
                <select
                  value={exchange}
                  onChange={(e) => setExchange(e.target.value as Exchange)}
                  className="w-full px-3 py-2.5 rounded-lg bg-bg-primary border border-border
                             text-text-primary text-sm focus:outline-none focus:border-accent
                             transition-colors cursor-pointer appearance-none"
                >
                  <option value="NSE">NSE</option>
                  <option value="BSE">BSE</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-tertiary uppercase tracking-wider mb-1.5">
                  Order Type
                </label>
                <select
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value as OrderType)}
                  className="w-full px-3 py-2.5 rounded-lg bg-bg-primary border border-border
                             text-text-primary text-sm focus:outline-none focus:border-accent
                             transition-colors cursor-pointer appearance-none"
                >
                  <option value="MARKET">MARKET</option>
                  <option value="LIMIT">LIMIT</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-text-tertiary uppercase tracking-wider mb-1.5">
                  Product
                </label>
                <div
                  className="w-full px-3 py-2.5 rounded-lg bg-bg-primary border border-border text-text-primary text-sm"
                  title="Change in Settings → Paper Trading"
                >
                  {appSettings?.paperDefaultProduct ?? "CNC"}
                  <span className="text-text-tertiary text-xs ml-1">
                    ({appSettings?.paperDefaultProduct === "MIS" ? "Intraday" : "Delivery"})
                  </span>
                </div>
              </div>
            </div>

            {/* Quantity */}
            <div className="mb-4">
              <label className="block text-xs text-text-tertiary uppercase tracking-wider mb-1.5">
                Quantity
                {appSettings && (
                  <span className="text-text-tertiary font-normal normal-case ml-1">
                    (default {appSettings.defaultQuantity})
                  </span>
                )}
              </label>
              <input
                type="number"
                min={1}
                placeholder={String(appSettings?.defaultQuantity ?? 1)}
                value={qty}
                onChange={(e) => { setQty(e.target.value); setValidationError(""); }}
                className="w-full px-3 py-2.5 rounded-lg bg-bg-primary border border-border
                           text-text-primary placeholder:text-text-tertiary text-sm
                           focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            {/* Price field for LIMIT orders */}
            {orderType === "LIMIT" && (
              <div className="mb-4">
                <label className="block text-xs text-text-tertiary uppercase tracking-wider mb-1.5">
                  Limit Price
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.05}
                  placeholder="0.00"
                  value={limitPrice}
                  onChange={(e) => { setLimitPrice(e.target.value); setValidationError(""); }}
                  className="w-full px-3 py-2.5 rounded-lg bg-bg-primary border border-border
                             text-text-primary placeholder:text-text-tertiary text-sm
                             focus:outline-none focus:border-accent transition-colors"
                />
              </div>
            )}

            {/* Manual price entry for MARKET orders when Zerodha not connected */}
            {orderType === "MARKET" && !zerodhaConnected && (
              <div className="mb-4">
                <label className="block text-xs text-text-tertiary uppercase tracking-wider mb-1.5">
                  Price (Manual Entry)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.05}
                  placeholder="Enter current market price"
                  value={manualPrice}
                  onChange={(e) => { setManualPrice(e.target.value); setValidationError(""); }}
                  className="w-full px-3 py-2.5 rounded-lg bg-bg-primary border border-border
                             text-text-primary placeholder:text-text-tertiary text-sm
                             focus:outline-none focus:border-accent transition-colors"
                />
                <p className="text-xs text-amber-400/80 mt-1.5">
                  Connect to Zerodha for live prices
                </p>
              </div>
            )}

            {/* Market price indicator when connected */}
            {orderType === "MARKET" && zerodhaConnected && quote && (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-bg-primary mb-4">
                <span className="text-xs text-text-tertiary">Market Price</span>
                <span className="text-sm font-semibold text-text-primary">
                  {formatCurrency(quote.lastPrice)}
                </span>
              </div>
            )}

            {/* Estimated Cost */}
            {estimatedCost !== null && estimatedCost > 0 && (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-bg-primary mb-5">
                <span className="text-xs text-text-tertiary">
                  Estimated {orderSide === "BUY" ? "Cost" : "Value"}
                  {appSettings?.simulateBrokerage ? " (incl. charges)" : ""}
                </span>
                <span className="text-sm font-semibold text-text-primary">
                  {formatCurrency(estimatedCost)}
                </span>
              </div>
            )}

            {/* Validation Error */}
            {validationError && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
                <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <span className="text-xs text-red-400">{validationError}</span>
              </div>
            )}

            {/* Place Order Button */}
            <button
              onClick={handlePlaceOrder}
              className={cn(
                "w-full py-3 rounded-lg font-semibold text-sm transition-all duration-200 cursor-pointer",
                "disabled:opacity-40 disabled:cursor-not-allowed",
                orderSide === "BUY"
                  ? "bg-profit hover:bg-emerald-400 text-white shadow-lg shadow-profit/20"
                  : "bg-loss hover:bg-red-400 text-white shadow-lg shadow-loss/20"
              )}
            >
              <span className="flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" />
                Place {orderSide} Order
              </span>
            </button>
          </div>

          {/* Quote Panel */}
          {quote && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-base font-semibold text-text-primary">{quote.symbol}</h3>
                  <span className="text-xs text-text-tertiary">{quote.exchange}</span>
                </div>
                <div className="text-right">
                  <p className={cn(
                    "text-lg font-bold",
                    quote.changePercent >= 0 ? "text-profit" : "text-loss"
                  )}>
                    {formatCurrency(quote.lastPrice)}
                  </p>
                  <span className={cn(
                    "text-xs font-medium px-1.5 py-0.5 rounded",
                    quote.changePercent >= 0
                      ? "bg-profit/10 text-profit"
                      : "bg-loss/10 text-loss"
                  )}>
                    {quote.change >= 0 ? "+" : ""}{quote.change?.toFixed(2)} ({formatPercent(quote.changePercent)})
                  </span>
                </div>
              </div>

              {/* OHLC */}
              <div className="grid grid-cols-4 gap-2 text-xs mb-3 py-2 border-y border-border">
                <div>
                  <span className="text-text-tertiary block">Open</span>
                  <p className="text-text-secondary font-medium">{formatCurrency(quote.open)}</p>
                </div>
                <div>
                  <span className="text-text-tertiary block">High</span>
                  <p className="text-profit font-medium">{formatCurrency(quote.high)}</p>
                </div>
                <div>
                  <span className="text-text-tertiary block">Low</span>
                  <p className="text-loss font-medium">{formatCurrency(quote.low)}</p>
                </div>
                <div>
                  <span className="text-text-tertiary block">Close</span>
                  <p className="text-text-secondary font-medium">{formatCurrency(quote.close)}</p>
                </div>
              </div>

              {/* Volume & Circuit */}
              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                <div>
                  <span className="text-text-tertiary">Volume</span>
                  <p className="text-text-secondary font-medium">{(quote.volume || 0).toLocaleString("en-IN")}</p>
                </div>
                <div>
                  <span className="text-text-tertiary">Circuit</span>
                  <p className="text-text-secondary font-medium">
                    {formatCurrency(quote.lowerCircuit)} - {formatCurrency(quote.upperCircuit)}
                  </p>
                </div>
              </div>

              {/* Market Depth */}
              {(quote.buyDepth?.length > 0 || quote.sellDepth?.length > 0) && (
                <div>
                  <p className="text-xs text-text-tertiary mb-2 font-medium uppercase tracking-wider">Market Depth</p>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="grid grid-cols-3 text-text-tertiary mb-1 font-medium">
                        <span>Bid</span><span className="text-right">Qty</span><span className="text-right">Ord</span>
                      </div>
                      {quote.buyDepth?.map((b, i) => (
                        <div key={i} className="grid grid-cols-3 text-profit/80 py-0.5">
                          <span>{b.price?.toFixed(2)}</span>
                          <span className="text-right">{b.quantity}</span>
                          <span className="text-right">{b.orders}</span>
                        </div>
                      ))}
                      <div className="mt-1 text-text-tertiary text-[10px]">
                        Total: <span className="text-profit">{(quote.totalBuyQty || 0).toLocaleString("en-IN")}</span>
                      </div>
                    </div>
                    <div>
                      <div className="grid grid-cols-3 text-text-tertiary mb-1 font-medium">
                        <span>Ask</span><span className="text-right">Qty</span><span className="text-right">Ord</span>
                      </div>
                      {quote.sellDepth?.map((s, i) => (
                        <div key={i} className="grid grid-cols-3 text-loss/80 py-0.5">
                          <span>{s.price?.toFixed(2)}</span>
                          <span className="text-right">{s.quantity}</span>
                          <span className="text-right">{s.orders}</span>
                        </div>
                      ))}
                      <div className="mt-1 text-text-tertiary text-[10px]">
                        Total: <span className="text-loss">{(quote.totalSellQty || 0).toLocaleString("en-IN")}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* No Zerodha message */}
          {!zerodhaConnected && !isCheckingAuth && symbol.trim() && (
            <div className="card">
              <div className="flex items-start gap-3 text-amber-400/80">
                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-400">Connect to Zerodha for live prices</p>
                  <p className="text-xs text-text-tertiary mt-1">
                    You can still trade with manual price entry. Go to
                    <a href="/live-trading" className="text-accent ml-1 hover:underline">Live Trading</a>
                    {" "}to connect.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Holdings Table */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">
              Holdings
              {holdings.length > 0 && (
                <span className="ml-2 text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">
                  {holdings.length}
                </span>
              )}
            </h2>
            {holdings.length > 0 && (
              <div className="text-xs text-text-tertiary text-right">
                <span>Invested: {formatCurrency(portfolio.invested)}</span>
                <span className="mx-2">·</span>
                <span className={portfolio.pnl >= 0 ? "text-profit" : "text-loss"}>
                  P&L: {portfolio.pnl >= 0 ? "+" : ""}{formatCurrency(portfolio.pnl)} ({formatPercent(portfolio.pnlPercent)})
                </span>
              </div>
            )}
          </div>

          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">Symbol</th>
                  <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">Qty</th>
                  <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">Avg Price</th>
                  <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">LTP</th>
                  <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">Invested</th>
                  <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">Current Value</th>
                  <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">P&L</th>
                  <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">P&L %</th>
                  <th className="text-center text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">Action</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  const mark = h.ltp > 0 ? h.ltp : h.avgPrice;
                  const currentVal = h.qty * mark;
                  const investedVal = h.qty * h.avgPrice;
                  const pnl = currentVal - investedVal;
                  const pnlPct = investedVal > 0 ? (pnl / investedVal) * 100 : 0;
                  const isProfit = pnl >= 0;

                  return (
                    <tr
                      key={`${h.symbol}-${h.exchange}`}
                      className="border-b border-border/50 hover:bg-bg-hover/50 transition-colors"
                    >
                      <td className="py-3 px-5">
                        <span className="font-medium text-text-primary">{h.symbol}</span>
                        <span className="text-text-tertiary text-xs ml-1.5">{h.exchange}</span>
                      </td>
                      <td className="py-3 px-5 text-right text-text-secondary">
                        {formatNumber(h.qty)}
                      </td>
                      <td className="py-3 px-5 text-right text-text-secondary">
                        {formatCurrency(h.avgPrice)}
                      </td>
                      <td className="py-3 px-5 text-right text-text-primary font-medium">
                        {formatCurrency(h.ltp)}
                      </td>
                      <td className="py-3 px-5 text-right text-text-secondary">
                        {formatCurrency(investedVal)}
                      </td>
                      <td className="py-3 px-5 text-right text-text-primary">
                        {formatCurrency(currentVal)}
                      </td>
                      <td className={cn("py-3 px-5 text-right font-medium", isProfit ? "text-profit" : "text-loss")}>
                        <span className="inline-flex items-center gap-1">
                          {isProfit ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                          {isProfit ? "+" : ""}{formatCurrency(pnl)}
                        </span>
                      </td>
                      <td className={cn("py-3 px-5 text-right font-medium", isProfit ? "text-profit" : "text-loss")}>
                        {formatPercent(pnlPct)}
                      </td>
                      <td className="py-3 px-5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleExit(h)}
                            className="px-2.5 py-1 text-xs font-medium rounded bg-loss/10 text-loss
                                       hover:bg-loss/20 transition-colors cursor-pointer border border-loss/20"
                            title="Pre-fill sell order"
                          >
                            Exit
                          </button>
                          <button
                            onClick={() => handleSquareOff(h)}
                            className="px-2.5 py-1 text-xs font-medium rounded bg-amber-500/10 text-amber-400
                                       hover:bg-amber-500/20 transition-colors cursor-pointer border border-amber-500/20"
                            title="Sell all at LTP immediately"
                          >
                            <LogOut className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {holdings.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-text-tertiary">
                      No holdings yet. Place your first order!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Strategy performance (realized P&L from closed trades) */}
      {strategyDetails.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold text-text-primary">Strategy performance</h2>
          </div>
          <p className="text-xs text-text-tertiary mb-4 px-0">
            Click a strategy to see each share — buy/sell dates, amounts, and P&amp;L per stock.
          </p>
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs text-text-tertiary uppercase tracking-wider py-3 px-5 w-8" />
                  <th className="text-left text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">Strategy</th>
                  <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">Trades</th>
                  <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">Stocks</th>
                  <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">Closed</th>
                  <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">Win / Loss</th>
                  <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">Realized P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {strategyDetails.map((bundle) => {
                  const s = bundle.summary;
                  const isOpen = expandedStrategyKey === bundle.key;
                  const stockCount = bundle.symbols.length;
                  return (
                    <Fragment key={bundle.key}>
                      <tr
                        onClick={() =>
                          setExpandedStrategyKey(isOpen ? null : bundle.key)
                        }
                        className={cn(
                          "border-b border-border/50 cursor-pointer transition-colors",
                          isOpen ? "bg-accent/5" : "hover:bg-bg-secondary/60"
                        )}
                      >
                        <td className="py-3 px-5 text-text-tertiary">
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </td>
                        <td className="py-3 px-5 font-medium text-text-primary">
                          {s.strategyName}
                        </td>
                        <td className="py-3 px-5 text-right text-text-secondary">{s.trades}</td>
                        <td className="py-3 px-5 text-right text-text-secondary">{stockCount}</td>
                        <td className="py-3 px-5 text-right text-text-secondary">{s.closedRounds}</td>
                        <td className="py-3 px-5 text-right text-text-secondary">
                          <span className="text-profit">{s.wins}</span>
                          {" / "}
                          <span className="text-loss">{s.losses}</span>
                        </td>
                        <td
                          className={cn(
                            "py-3 px-5 text-right font-semibold",
                            s.realizedPnl >= 0 ? "text-profit" : "text-loss"
                          )}
                        >
                          {s.realizedPnl >= 0 ? "+" : ""}
                          {formatCurrency(s.realizedPnl)}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${bundle.key}-detail`} className="border-b border-border/50 bg-bg-secondary/30">
                          <td colSpan={7} className="py-4 px-5">
                            {bundle.symbols.length === 0 ? (
                              <p className="text-sm text-text-tertiary">No trades recorded for this strategy.</p>
                            ) : (
                              <div className="space-y-4">
                                {bundle.symbols.map((sym) => {
                                  const totalPnl = sym.realizedPnl + sym.unrealizedPnl;
                                  return (
                                    <div
                                      key={`${sym.symbol}-${sym.exchange}`}
                                      className="rounded-lg border border-border/60 overflow-hidden"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-bg-primary/50 border-b border-border/50">
                                        <div className="flex items-center gap-2">
                                          <span className="font-semibold text-text-primary">{sym.symbol}</span>
                                          <span className="text-xs text-text-tertiary">{sym.exchange}</span>
                                          <span
                                            className={cn(
                                              "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-medium",
                                              sym.status === "open"
                                                ? "bg-amber-500/15 text-amber-400"
                                                : "bg-border/50 text-text-tertiary"
                                            )}
                                          >
                                            {sym.status === "open" ? "Open" : "Closed"}
                                          </span>
                                        </div>
                                        <div className="flex flex-wrap gap-4 text-xs">
                                          <span className="text-text-tertiary">
                                            Realized:{" "}
                                            <span className={sym.realizedPnl >= 0 ? "text-profit font-medium" : "text-loss font-medium"}>
                                              {sym.realizedPnl >= 0 ? "+" : ""}
                                              {formatCurrency(sym.realizedPnl)}
                                            </span>
                                          </span>
                                          {sym.openQty > 0 && (
                                            <span className="text-text-tertiary">
                                              Open {formatNumber(sym.openQty)} @ {formatCurrency(sym.openAvgCost)}
                                              {" · "}
                                              Unrealized:{" "}
                                              <span className={sym.unrealizedPnl >= 0 ? "text-profit font-medium" : "text-loss font-medium"}>
                                                {sym.unrealizedPnl >= 0 ? "+" : ""}
                                                {formatCurrency(sym.unrealizedPnl)}
                                              </span>
                                            </span>
                                          )}
                                          <span className="text-text-secondary font-medium">
                                            Total:{" "}
                                            <span className={totalPnl >= 0 ? "text-profit" : "text-loss"}>
                                              {totalPnl >= 0 ? "+" : ""}
                                              {formatCurrency(totalPnl)}
                                            </span>
                                          </span>
                                        </div>
                                      </div>
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="text-text-tertiary uppercase tracking-wider border-b border-border/40">
                                            <th className="text-left py-2 px-4 font-medium">Date &amp; time</th>
                                            <th className="text-left py-2 px-4 font-medium">Side</th>
                                            <th className="text-right py-2 px-4 font-medium">Qty</th>
                                            <th className="text-right py-2 px-4 font-medium">Price</th>
                                            <th className="text-right py-2 px-4 font-medium">Amount</th>
                                            <th className="text-right py-2 px-4 font-medium">P&amp;L</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {sym.events.map((ev) => {
                                            const isBuy = ev.side === "BUY";
                                            return (
                                              <tr
                                                key={ev.tradeId}
                                                className="border-b border-border/30 last:border-0"
                                              >
                                                <td className="py-2 px-4 text-text-secondary font-mono whitespace-nowrap">
                                                  {ev.dateTimeLabel}
                                                </td>
                                                <td className="py-2 px-4">
                                                  <span
                                                    className={cn(
                                                      "inline-flex px-1.5 py-0.5 rounded font-semibold",
                                                      isBuy ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss"
                                                    )}
                                                  >
                                                    {ev.side}
                                                  </span>
                                                </td>
                                                <td className="py-2 px-4 text-right text-text-secondary">
                                                  {formatNumber(ev.qty)}
                                                </td>
                                                <td className="py-2 px-4 text-right text-text-primary">
                                                  {formatCurrency(ev.price)}
                                                </td>
                                                <td className="py-2 px-4 text-right text-text-primary">
                                                  {formatCurrency(ev.total)}
                                                </td>
                                                <td className="py-2 px-4 text-right font-medium">
                                                  {ev.side === "SELL" && ev.realizedPnl != null ? (
                                                    <span className={ev.realizedPnl >= 0 ? "text-profit" : "text-loss"}>
                                                      {ev.realizedPnl >= 0 ? "+" : ""}
                                                      {formatCurrency(ev.realizedPnl)}
                                                      {ev.matchedBuyPrice != null && (
                                                        <span className="block text-[10px] text-text-tertiary font-normal">
                                                          vs buy {formatCurrency(ev.matchedBuyPrice)}
                                                        </span>
                                                      )}
                                                    </span>
                                                  ) : (
                                                    <span className="text-text-tertiary">—</span>
                                                  )}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trade History */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">
            Trade History
            {enrichedTrades.length > 0 && (
              <span className="ml-2 text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">
                {enrichedTrades.length}
              </span>
            )}
          </h2>
          <div className="text-xs text-text-tertiary text-right max-w-md">
            {strategyTradeCount > 0 && (
              <span>
                {strategyTradeCount} strategy trade{strategyTradeCount !== 1 ? "s" : ""}
                {" · "}
              </span>
            )}
            {holdings.length} holding{holdings.length !== 1 ? "s" : ""}
            {holdingsNotInHistory.length > 0 && (
              <span className="block text-amber-400/90 mt-1">
                {holdingsNotInHistory.length} holding
                {holdingsNotInHistory.length !== 1 ? "s" : ""} not in history (
                {holdingsNotInHistory.map((h) => h.symbol).join(", ")}) — may predate logging or were merged as duplicates.
              </span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">Date &amp; time</th>
                <th className="text-left text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">Symbol</th>
                <th className="text-left text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">Strategy</th>
                <th className="text-left text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">Side</th>
                <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">Qty</th>
                <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">Price</th>
                <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">Total</th>
                {appSettings?.simulateBrokerage && (
                  <>
                    <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">Charges</th>
                    <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">Net P&amp;L</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {enrichedTrades.map((t) => {
                const isBuy = t.side === "BUY";
                const isManual =
                  t.displayStrategyName === "Manual" &&
                  !t.id?.startsWith("strat-");
                return (
                  <tr
                    key={t.id}
                    className={cn(
                      "border-b border-border/50 transition-colors",
                      isBuy
                        ? "bg-profit/[0.03] hover:bg-profit/[0.07]"
                        : "bg-loss/[0.03] hover:bg-loss/[0.07]"
                    )}
                  >
                    <td className="py-3 px-5 text-text-secondary font-mono text-xs whitespace-nowrap">
                      {formatTradeDateTime(t)}
                    </td>
                    <td className="py-3 px-5 font-medium text-text-primary">
                      {t.symbol}
                      <span className="text-text-tertiary text-xs ml-1">{t.exchange}</span>
                    </td>
                    <td className="py-3 px-5 max-w-[160px]">
                      <span
                        className={cn(
                          "inline-block text-xs font-medium px-2 py-0.5 rounded truncate max-w-full",
                          isManual
                            ? "bg-border/40 text-text-tertiary"
                            : "bg-accent/15 text-accent"
                        )}
                        title={t.reason || t.displayStrategyName}
                      >
                        {t.displayStrategyName}
                      </span>
                    </td>
                    <td className="py-3 px-5">
                      <span className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold",
                        isBuy ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss"
                      )}>
                        {isBuy ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {t.side}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-right text-text-secondary">{formatNumber(t.qty)}</td>
                    <td className="py-3 px-5 text-right text-text-primary">{formatCurrency(t.price)}</td>
                    <td className="py-3 px-5 text-right text-text-primary font-medium">{formatCurrency(t.qty * t.price)}</td>
                    {appSettings?.simulateBrokerage && (
                      <>
                        <td className="py-3 px-5 text-right text-text-tertiary text-xs">
                          {t.charges != null ? formatCurrency(t.charges) : "—"}
                        </td>
                        <td className="py-3 px-5 text-right text-xs">
                          {t.netPnl != null ? (
                            <span className={t.netPnl >= 0 ? "text-profit" : "text-loss"}>
                              {formatCurrency(t.netPnl)}
                            </span>
                          ) : (
                            <span className="text-text-tertiary">—</span>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
              {enrichedTrades.length === 0 && (
                <tr>
                  <td colSpan={appSettings?.simulateBrokerage ? 9 : 7} className="py-12 text-center text-text-tertiary">
                    No trades yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
