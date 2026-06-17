"use client";

import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
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
import { cn, formatCurrency, formatPercent, formatNumber, isMarketOpen } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  getPaperTradingState,
  savePaperTradingState,
  resetPaperTrading,
  saveOrder,
  getOrders,
  getSettings,
  getActiveStrategies,
  type AppSettings,
} from "@/lib/firebase";
import type { OrderRecord, PaperTrade, PaperTradingState } from "@/lib/firebase";
import {
  newTradeIds,
  paperTradeToOrderRecord,
} from "@/lib/portfolio/paper-order-record";
import { loadSettingsFromCache, saveSettingsToCache } from "@/lib/settings/cache";
import {
  applyPaperRiskExits,
  canPlacePaperBuy,
} from "@/lib/risk/paper-risk-guard";
import { canExecuteStrategyTrade } from "@/lib/strategies/portfolio-gate";
import { executePortfolioDecision } from "@/lib/portfolio/order-engine";
import {
  ensurePositions,
  getManualExitPosition,
} from "@/lib/portfolio/position-manager";
import type { PaperPosition } from "@/lib/portfolio/types";
import { resolveHoldingBuySignalCount } from "@/lib/portfolio/holding-strength";
import { OWNER_MANUAL } from "@/lib/portfolio/types";
import {
  computeZerodhaCharges,
  cashFlowForTrade,
} from "@/lib/brokerage/zerodha-charges";
import {
  enrichTradesWithStrategy,
  computeStrategyDetailBundles,
  buildStrategyNamesBySymbol,
} from "@/lib/strategies/strategy-performance";
import StrategyBadges from "@/components/strategy-badges";
import {
  formatTradeDateTime,
  normalizePaperTrades,
  tradesNormalizedChanged,
  tradeExecutedAtMs,
} from "@/lib/paper-trades/normalize";
import { fetchMarketQuote } from "@/lib/market-data/fetch-quote-client";
import { formatBuyStrength, resolvePaperStartingBalance } from "@/lib/paper-trading/balance";
import { refreshHoldingsLtpClient } from "@/lib/market-data/refresh-holdings-ltp";
import { computePnlBreakdown } from "@/lib/portfolio/compute-portfolio";
import { PaperOrderPanel } from "@/app/paper-trading/order-panel";
import PaperExportMenu from "@/components/paper-export-menu";
import PaperHealthPanel from "@/components/paper-health-panel";
import {
  resolveTradeCharges,
  formatChargesTooltip,
} from "@/lib/brokerage/trade-charges";
import {
  paperOrderNotional,
  resolvePaperOrderQty,
} from "@/lib/portfolio/paper-position-size";
import { nowISTDateTimeString } from "@/lib/utils";

type OrderSide = "BUY" | "SELL";
type OrderType = "MARKET" | "LIMIT";
type Exchange = "NSE" | "BSE";

interface Holding {
  symbol: string;
  exchange: Exchange;
  qty: number;
  avgPrice: number;
  ltp: number;
  buySignalCount?: number;
  ownerStrategyName?: string;
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
  const positionsRef = useRef<PaperPosition[]>([]);

  function buildPaperBase(
    balanceValue: number,
    holdingsValue: Holding[],
    tradesValue: PaperTrade[]
  ) {
    return ensurePositions({
      balance: balanceValue,
      holdings: holdingsValue,
      positions: positionsRef.current,
      trades: tradesValue,
    });
  }

  function applyPaperState(state: PaperTradingState, tradesValue: Trade[]) {
    positionsRef.current = state.positions ?? [];
    setBalance(state.balance ?? INITIAL_BALANCE);
    setHoldings((state.holdings ?? []) as Holding[]);
    setTrades(tradesValue);
  }

  const [validationError, setValidationError] = useState("");
  const [orderHistory, setOrderHistory] = useState<OrderRecord[]>([]);
  const [expandedStrategyKey, setExpandedStrategyKey] = useState<string | null>(
    null
  );
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [riskToast, setRiskToast] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [orderPanelOpen, setOrderPanelOpen] = useState(false);
  const [strategyNamesBySymbol, setStrategyNamesBySymbol] = useState<
    Map<string, string[]>
  >(new Map());
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
    positions?: PaperPosition[];
    cloudSyncedAtMs?: number;
  }) => {
    positionsRef.current = state.positions ?? [];
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
          positions: state.positions,
          trades: normalized,
        });
      }
      const synced = ensurePositions({
        balance: state.balance,
        holdings: state.holdings ?? [],
        positions: state.positions ?? [],
        trades: normalized,
      });
      applyCloudState({
        balance: synced.balance ?? state.balance,
        holdings: (synced.holdings ?? []) as Holding[],
        positions: synced.positions,
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
    if (!user) return;
    syncFromCloud();
    getSettings()
      .then((s) => {
        setAppSettings(s);
        saveSettingsToCache(s);
        setExchange((s.defaultExchange as Exchange) || "NSE");
        setOrderType((s.defaultOrderType as OrderType) || "MARKET");
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

  useEffect(() => {
    if (!user) return;
    const load = () => {
      void getActiveStrategies().then((strategies) => {
        setStrategyNamesBySymbol(buildStrategyNamesBySymbol(strategies));
      });
    };
    load();
    window.addEventListener("strategies-updated", load);
    return () => window.removeEventListener("strategies-updated", load);
  }, [user]);

  // Refresh LTP / P&L during market hours only (avoids flicker after close)
  useEffect(() => {
    if (!mounted || holdings.length === 0 || !isMarketOpen()) return;

    let cancelled = false;
    async function refreshLtps() {
      const updated = await refreshHoldingsLtpClient(holdingsRef.current);
      if (cancelled) return;

      const settings = settingsRef.current;
      if (settings?.autoStopLoss || settings?.autoTakeProfit) {
        const { state, exits } = applyPaperRiskExits(
          buildPaperBase(
            balanceRef.current,
            updated,
            tradesRef.current as PaperTrade[]
          ),
          settings
        );
        if (exits.length > 0) {
          const tradesBefore = tradesRef.current as PaperTrade[];
          positionsRef.current = state.positions ?? [];
          setBalance(state.balance ?? balanceRef.current);
          setHoldings((state.holdings ?? []) as Holding[]);
          setTrades((state.trades ?? []) as Trade[]);
          savePaperTradingState(state).catch(() => {});
          for (const trade of newTradeIds(
            tradesBefore,
            (state.trades ?? []) as PaperTrade[]
          )) {
            saveOrder(
              paperTradeToOrderRecord(trade, {
                product: settings?.paperDefaultProduct,
              })
            ).catch(() => {});
          }
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

  const selectedHolding = useMemo(
    () =>
      holdings.find(
        (h) =>
          h.symbol.toUpperCase() === symbol.trim().toUpperCase() &&
          h.exchange === exchange
      ),
    [holdings, symbol, exchange]
  );

  const buyQty = useMemo(() => {
    if (!appSettings || !estimatedPrice || estimatedPrice <= 0) return 0;
    return resolvePaperOrderQty(estimatedPrice, appSettings, { balance });
  }, [appSettings, estimatedPrice, balance]);

  const orderQty = orderSide === "SELL" ? (selectedHolding?.qty ?? 0) : buyQty;

  const estimatedCost = useMemo(() => {
    const qtyNum = orderQty;
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
  }, [
    estimatedPrice,
    orderQty,
    orderSide,
    appSettings?.simulateBrokerage,
    appSettings?.paperDefaultProduct,
  ]);

  function handlePlaceOrder() {
    setValidationError("");
    const qtyNum = orderQty;
    if (!symbol.trim()) {
      setValidationError("Please enter a symbol");
      return;
    }
    if (!qtyNum || qtyNum <= 0) {
      setValidationError(
        orderSide === "SELL"
          ? "No holding to sell for this symbol"
          : "Enter a valid price to calculate order size"
      );
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

    const paperState = buildPaperBase(balance, holdings, trades as PaperTrade[]);

    if (appSettings) {
      const gate = canExecuteStrategyTrade(orderSide, sym, exchange, {
        holdings: paperState.holdings ?? [],
        positions: paperState.positions,
        trades: trades as PaperTrade[],
        settings: appSettings,
        ownerStrategyId: OWNER_MANUAL,
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

    const manualPosition =
      orderSide === "SELL"
        ? getManualExitPosition(paperState, sym, exchange)
        : undefined;

    const { state, executed, message } = executePortfolioDecision(
      paperState,
      {
        action: orderSide,
        symbol: sym,
        exchange,
        ownerStrategyId: OWNER_MANUAL,
        ownerStrategyName: "Manual",
        price,
        quantity: qtyNum,
        signalReason: "Manual order",
        exitReason: orderSide === "SELL" ? "MANUAL_EXIT" : undefined,
        positionId: manualPosition?.id,
      },
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
    positionsRef.current = state.positions ?? [];
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
      positions: state.positions,
      trades: merged,
    }).catch(() => {});

    setSymbol("");
    setLimitPrice("");
    setManualPrice("");
    setQuote(null);
    setValidationError("");

    setOrderPanelOpen(false);

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

  function openOrderPanel(side: OrderSide = "BUY") {
    setOrderSide(side);
    setValidationError("");
    setOrderPanelOpen(true);
  }

  function closeOrderPanel() {
    setOrderPanelOpen(false);
  }

  function handleExit(holding: Holding) {
    setOrderSide("SELL");
    setSymbol(holding.symbol);
    setExchange(holding.exchange);
    setOrderType("MARKET");
    setManualPrice(holding.ltp.toString());
    setValidationError("");

    if (zerodhaConnected) {
      fetchQuote(holding.symbol, holding.exchange);
    }

    setOrderPanelOpen(true);
  }

  function handleSquareOff(holding: Holding) {
    const price = holding.ltp;
    if (!price || price <= 0) {
      setValidationError("Unable to square off — invalid price");
      return;
    }

    const sym = holding.symbol.toUpperCase().trim();
    const paperState = buildPaperBase(balance, holdings, trades as PaperTrade[]);

    const position = getManualExitPosition(paperState, sym, holding.exchange);
    const { state, executed, message, trade } = executePortfolioDecision(
      paperState,
      {
        action: "SELL",
        symbol: sym,
        exchange: holding.exchange,
        ownerStrategyId: OWNER_MANUAL,
        ownerStrategyName: "Manual",
        price,
        quantity: holding.qty,
        signalReason: "Manual square-off",
        exitReason: "MANUAL_EXIT",
        positionId: position?.id,
      },
      {
        simulateBrokerage: appSettings?.simulateBrokerage,
        product: appSettings?.paperDefaultProduct ?? "CNC",
      }
    );

    if (!executed || !trade) {
      setValidationError(message ?? "Square-off could not be executed");
      return;
    }

    const merged = normalizePaperTrades(state.trades ?? [], orderHistory);
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
      positions: state.positions,
      trades: merged,
    }).catch(() => {});

    saveOrder(
      paperTradeToOrderRecord(trade, {
        product: appSettings?.paperDefaultProduct,
      })
    ).catch(() => {});
    setValidationError("");
  }

  async function handleReset() {
    setResetLoading(true);
    setResetMessage(null);
    try {
      await resetPaperTrading();
      setHoldings([]);
      setTrades([]);
      setBalance(INITIAL_BALANCE);
      setSymbol("");
      setLimitPrice("");
      setManualPrice("");
      setOrderSide("BUY");
      setOrderType("MARKET");
      setQuote(null);
      setValidationError("");
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem("paperTrades");
      } catch {}
      setOrderHistory([]);
      setResetConfirm(false);
      setResetMessage({
        ok: true,
        text: appSettings
          ? `Portfolio reset — ${formatCurrency(appSettings.paperStartingBalance ?? 10_000_000)} balance restored; orders and scan locks cleared.`
          : "Portfolio reset — balance restored; orders and scan locks cleared.",
      });
      window.dispatchEvent(new CustomEvent("strategies-updated"));
    } catch (e) {
      setResetMessage({
        ok: false,
        text:
          e instanceof Error
            ? `Reset failed: ${e.message}`
            : "Reset failed — try Settings → Reset Paper Portfolio.",
      });
    } finally {
      setResetLoading(false);
    }
  }

  const startingBalance = resolvePaperStartingBalance(appSettings);

  const normalizedTrades = useMemo(
    () => normalizePaperTrades(trades as PaperTrade[], orderHistory),
    [trades, orderHistory]
  );

  const pnlBreakdown = useMemo(
    () =>
      computePnlBreakdown(
        normalizedTrades,
        holdings,
        balance,
        startingBalance
      ),
    [normalizedTrades, holdings, balance, startingBalance]
  );
  const portfolio = pnlBreakdown.portfolio;

  const enrichOptions = useMemo(
    () => ({ strategyNamesBySymbol }),
    [strategyNamesBySymbol]
  );

  const enrichedTrades = useMemo(
    () => enrichTradesWithStrategy(normalizedTrades, enrichOptions),
    [normalizedTrades, enrichOptions]
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
        })),
        enrichOptions
      ),
    [normalizedTrades, holdings, enrichOptions]
  );
  const buyStrategiesBySymbol = useMemo(() => {
    const map = new Map<string, { names: string[]; unknown: number }>();
    const chronological = [...enrichedTrades].sort(
      (a, b) => tradeExecutedAtMs(a) - tradeExecutedAtMs(b)
    );
    for (const t of chronological) {
      if (t.side === "BUY") {
        map.set(
          `${t.symbol.toUpperCase()}:${(t.exchange || "NSE").toUpperCase()}`,
          {
            names: t.displayStrategyNames,
            unknown: t.unknownStrategyCount ?? 0,
          }
        );
      }
    }
    return map;
  }, [enrichedTrades]);
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
      hint: "Available cash",
    },
    {
      label: "Unrealized P&L",
      value: `${pnlBreakdown.unrealizedPnl >= 0 ? "+" : ""}${formatCurrency(pnlBreakdown.unrealizedPnl)} (${formatPercent(pnlBreakdown.unrealizedPnlPercent)})`,
      icon: pnlBreakdown.unrealizedPnl >= 0 ? ArrowUpRight : ArrowDownRight,
      color: pnlBreakdown.unrealizedPnl >= 0 ? "text-profit" : "text-loss",
      hint: isMarketOpen() ? "Open positions · live prices" : "Open positions · frozen after close",
    },
    {
      label: "Realized P&L",
      value: `${pnlBreakdown.realizedPnl >= 0 ? "+" : ""}${formatCurrency(pnlBreakdown.realizedPnl)}`,
      icon: pnlBreakdown.realizedPnl >= 0 ? TrendingUp : TrendingDown,
      color: pnlBreakdown.realizedPnl >= 0 ? "text-profit" : "text-loss",
      hint: "Closed sell trades",
    },
    {
      label: "All-time P&L",
      value: `${pnlBreakdown.allTimePnl >= 0 ? "+" : ""}${formatCurrency(pnlBreakdown.allTimePnl)} (${formatPercent(pnlBreakdown.allTimePnlPercent)})`,
      icon: pnlBreakdown.allTimePnl >= 0 ? ArrowUpRight : ArrowDownRight,
      color: pnlBreakdown.allTimePnl >= 0 ? "text-profit" : "text-loss",
      hint: "Cash + cost basis (excludes unrealized)",
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
            <PaperExportMenu settings={appSettings} />
            {resetConfirm ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => void handleReset()}
                  disabled={resetLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-loss text-white text-sm font-medium disabled:opacity-60"
                >
                  <RefreshCw className={cn("w-4 h-4", resetLoading && "animate-spin")} />
                  {resetLoading ? "Resetting…" : "Confirm reset"}
                </button>
                <button
                  onClick={() => setResetConfirm(false)}
                  disabled={resetLoading}
                  className="px-3 py-2 rounded-lg border border-border text-sm text-text-secondary hover:bg-bg-hover disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setResetMessage(null);
                  setResetConfirm(true);
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-bg-tertiary border border-border
                           text-text-secondary hover:text-text-primary hover:border-border-light
                           transition-all duration-200 text-sm cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                Reset Portfolio
              </button>
            )}
          </div>
        </div>

        {resetMessage && (
          <p
            role="status"
            className={cn(
              "mb-4 rounded-lg px-4 py-3 text-sm",
              resetMessage.ok
                ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                : "bg-loss-muted text-loss border border-loss/30"
            )}
          >
            {resetMessage.text}
          </p>
        )}

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
              · {formatCurrency(paperOrderNotional(appSettings))} per trade
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
                {"hint" in item && item.hint && (
                  <p className="text-[10px] text-text-tertiary mt-0.5 truncate">{item.hint}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Holdings */}
      <div className="card mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">
              Holdings
              {holdings.length > 0 && (
                <span className="ml-2 text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">
                  {holdings.length}
                </span>
              )}
            </h2>
            <div className="flex flex-wrap items-center gap-3 sm:justify-end">
              {holdings.length > 0 && (
                <div className="text-xs text-text-tertiary">
                  <span>Invested: {formatCurrency(portfolio.invested)}</span>
                  <span className="mx-2">·</span>
                  <span className={portfolio.pnl >= 0 ? "text-profit" : "text-loss"}>
                    Unrealized: {portfolio.pnl >= 0 ? "+" : ""}
                    {formatCurrency(portfolio.pnl)} ({formatPercent(portfolio.pnlPercent)})
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => openOrderPanel("BUY")}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-brand shadow-sm hover:opacity-90 transition-opacity"
              >
                <Plus className="h-4 w-4" />
                Place Order
              </button>
            </div>
          </div>

          {holdings.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-text-tertiary mb-4">No holdings yet.</p>
              <button
                type="button"
                onClick={() => openOrderPanel("BUY")}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-bg-hover transition-colors"
              >
                <Plus className="h-4 w-4" />
                Place your first order
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-3 pl-5 pr-2 text-left text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      Symbol
                    </th>
                    <th className="hidden py-3 px-2 text-left text-xs font-semibold uppercase tracking-wider text-text-tertiary sm:table-cell">
                      Strategies
                    </th>
                    <th className="py-3 px-2 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      Qty
                    </th>
                    <th className="py-3 px-2 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      Avg
                    </th>
                    <th className="py-3 px-2 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      LTP
                    </th>
                    <th className="hidden py-3 px-2 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary sm:table-cell">
                      Invested
                    </th>
                    <th className="hidden py-3 px-2 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary sm:table-cell">
                      Value
                    </th>
                    <th className="py-3 px-2 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      P&amp;L
                    </th>
                    <th className="hidden py-3 px-2 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary sm:table-cell">
                      P&amp;L %
                    </th>
                    <th className="py-3 pl-2 pr-5 text-center text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      Action
                    </th>
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
                    const signalCount = resolveHoldingBuySignalCount(
                      h,
                      normalizedTrades
                    );
                    const symKey = `${h.symbol.toUpperCase()}:${(h.exchange || "NSE").toUpperCase()}`;
                    const stratInfo = buyStrategiesBySymbol.get(symKey);

                    return (
                      <tr
                        key={`${h.symbol}-${h.exchange}`}
                        className="border-b border-border/50 transition-colors hover:bg-bg-hover/50"
                      >
                        <td className="py-3 pl-5 pr-2">
                          <span className="font-medium text-text-primary">{h.symbol}</span>
                          <span className="ml-1 text-xs text-text-tertiary">{h.exchange}</span>
                        </td>
                        <td className="hidden py-3 px-2 sm:table-cell">
                          {stratInfo && stratInfo.names.length > 0 ? (
                            <StrategyBadges
                              names={stratInfo.names}
                              unknownCount={stratInfo.unknown}
                              size="sm"
                            />
                          ) : signalCount != null && signalCount > 0 ? (
                            <span
                              className="text-xs text-text-tertiary"
                              title={formatBuyStrength(signalCount)}
                            >
                              {formatBuyStrength(signalCount)}
                            </span>
                          ) : (
                            <span className="text-xs text-text-tertiary">—</span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-right text-text-secondary tabular-nums">
                          {formatNumber(h.qty)}
                        </td>
                        <td className="py-3 px-2 text-right text-text-secondary tabular-nums whitespace-nowrap">
                          {formatCurrency(h.avgPrice)}
                        </td>
                        <td className="py-3 px-2 text-right font-medium text-text-primary tabular-nums whitespace-nowrap">
                          {formatCurrency(h.ltp)}
                        </td>
                        <td className="hidden py-3 px-2 text-right text-text-secondary tabular-nums whitespace-nowrap sm:table-cell">
                          {formatCurrency(investedVal)}
                        </td>
                        <td className="hidden py-3 px-2 text-right text-text-primary tabular-nums whitespace-nowrap sm:table-cell">
                          {formatCurrency(currentVal)}
                        </td>
                        <td
                          className={cn(
                            "py-3 px-2 text-right font-medium tabular-nums whitespace-nowrap",
                            isProfit ? "text-profit" : "text-loss"
                          )}
                        >
                          <span className="inline-flex items-center justify-end gap-0.5">
                            {isProfit ? (
                              <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                            ) : (
                              <ArrowDownRight className="h-3.5 w-3.5 shrink-0" />
                            )}
                            {isProfit ? "+" : ""}
                            {formatCurrency(pnl)}
                          </span>
                        </td>
                        <td
                          className={cn(
                            "hidden py-3 px-2 text-right font-medium tabular-nums sm:table-cell",
                            isProfit ? "text-profit" : "text-loss"
                          )}
                        >
                          {formatPercent(pnlPct)}
                        </td>
                        <td className="py-3 pl-2 pr-5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleExit(h)}
                              className="rounded border border-loss/20 bg-loss/10 px-2 py-1 text-xs font-medium text-loss transition-colors hover:bg-loss/20"
                              title="Pre-fill sell order"
                            >
                              Exit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSquareOff(h)}
                              className="rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
                              title="Sell all at LTP immediately"
                            >
                              <LogOut className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
                          <StrategyBadges names={[s.strategyName]} size="sm" />
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
                                            <th className="text-left py-2 px-4 font-medium">Strategies</th>
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
                                                  {ev.strategyNames && ev.strategyNames.length > 0 ? (
                                                    <StrategyBadges
                                                      names={ev.strategyNames}
                                                      unknownCount={ev.unknownStrategyCount}
                                                      size="sm"
                                                    />
                                                  ) : (
                                                    <span className="text-text-tertiary">—</span>
                                                  )}
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
            <span className="block mt-1 text-text-tertiary/90">
              Charges use Zerodha CNC/MIS schedule (brokerage, STT, GST, exchange, stamp duty).
              Enable <em>Simulate brokerage</em> in Settings to deduct from paper balance.
            </span>
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
                <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-3">Brokerage</th>
                <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-3">STT</th>
                <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-3">GST</th>
                <th
                  className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-3"
                  title="Brokerage + STT + GST + exchange + SEBI + stamp duty"
                >
                  Charges
                </th>
                <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">Net P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {enrichedTrades.map((t) => {
                const isBuy = t.side === "BUY";
                const isManual =
                  t.displayStrategyName === "Manual" &&
                  !t.id?.startsWith("strat-");
                const charges = resolveTradeCharges(t);
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
                    <td className="py-3 px-5 max-w-[120px]">
                      <StrategyBadges
                        names={t.displayStrategyNames}
                        unknownCount={t.unknownStrategyCount}
                        manual={isManual}
                        size="sm"
                      />
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
                    <td className="py-3 px-3 text-right text-text-tertiary text-xs tabular-nums">
                      {formatCurrency(charges.brokerage)}
                    </td>
                    <td className="py-3 px-3 text-right text-text-tertiary text-xs tabular-nums">
                      {formatCurrency(charges.stt)}
                    </td>
                    <td className="py-3 px-3 text-right text-text-tertiary text-xs tabular-nums">
                      {formatCurrency(charges.gst)}
                    </td>
                    <td
                      className="py-3 px-3 text-right text-text-tertiary text-xs tabular-nums"
                      title={formatChargesTooltip(charges)}
                    >
                      {formatCurrency(charges.total)}
                      {charges.estimated && (
                        <span className="block text-[10px] text-text-tertiary/80">est.</span>
                      )}
                    </td>
                    <td className="py-3 px-5 text-right text-xs">
                      {!isBuy && t.netPnl != null ? (
                        <span className={t.netPnl >= 0 ? "text-profit" : "text-loss"}>
                          {formatCurrency(t.netPnl)}
                        </span>
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {enrichedTrades.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-text-tertiary">
                    No trades yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PaperOrderPanel
        open={orderPanelOpen}
        onClose={closeOrderPanel}
        orderSide={orderSide}
        setOrderSide={setOrderSide}
        symbol={symbol}
        onSymbolChange={handleSymbolChange}
        exchange={exchange}
        setExchange={setExchange}
        orderType={orderType}
        setOrderType={setOrderType}
        limitPrice={limitPrice}
        setLimitPrice={setLimitPrice}
        manualPrice={manualPrice}
        setManualPrice={setManualPrice}
        zerodhaConnected={zerodhaConnected}
        isCheckingAuth={isCheckingAuth}
        quote={quote}
        isLoadingQuote={isLoadingQuote}
        searchResults={searchResults}
        showSuggestions={showSuggestions}
        setShowSuggestions={setShowSuggestions}
        isSearching={isSearching}
        onSearchFocus={() => {
          if (!searchResults.length) searchInstruments(symbol);
        }}
        onClearSymbol={() => {
          setSymbol("");
          setQuote(null);
          setSearchResults([]);
        }}
        onSelectSymbol={handleSelectSymbol}
        searchInstruments={searchInstruments}
        orderQty={orderQty}
        buyQty={buyQty}
        selectedHolding={!!selectedHolding}
        estimatedPrice={estimatedPrice}
        estimatedCost={estimatedCost}
        validationError={validationError}
        setValidationError={setValidationError}
        appSettings={appSettings}
        onPlaceOrder={handlePlaceOrder}
      />

      <PaperHealthPanel className="mt-8" />
    </div>
  );
}
