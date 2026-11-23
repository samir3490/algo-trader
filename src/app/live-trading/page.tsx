"use client";

import { useState, useEffect, useCallback, useRef, Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Inbox,
  Link2,
  Loader2,
  LogOut,
  Search,
  ShieldAlert,
  XCircle,
  Zap,
  ChevronDown,
  Users,
  RefreshCw,
  Wallet,
  IndianRupee,
  TrendingUp,
  TrendingDown,
  Plus as PlusIcon,
  X,
} from "lucide-react";
import StatCard from "@/components/ui/stat-card";
import LiveTabBar, {
  type LiveTradingTab,
} from "@/components/live-trading/live-tab-bar";
import LiveHealthPanel from "@/components/live-trading/live-health-panel";
import LiveAutoSwitch from "@/components/live-trading/live-auto-switch";
import LiveTradesPanel from "@/components/live-trading/live-trades-panel";
import LiveStrategyPerformancePanel from "@/components/live-trading/live-strategy-performance-panel";
import {
  cn,
  formatCurrency,
  formatDateTimeIST,
  formatNumber,
  formatPercent,
  isMarketOpen,
  getMarketStatus,
  nowISTDateTimeString,
  parseDateTimeMs,
  tableDateTimeThClass,
  tableDateTimeTdClass,
} from "@/lib/utils";
import StrategyBadges from "@/components/strategy-badges";
import { tradeExecutedAtMs } from "@/lib/paper-trades/normalize";
import { useAuth } from "@/lib/auth-context";
import { zerodhaFetch } from "@/lib/zerodha/client-fetch";
import {
  getSettings,
  saveSettings,
  getZerodhaAccounts,
  getLiveAlgoQuota,
  getLiveOrders as getFirestoreLiveOrders,
  getOrders as getFirestoreOrders,
  getActiveStrategies,
  saveOrder,
  type AppSettings,
  type ZerodhaAccount,
} from "@/lib/firebase";
import { fetchMarketQuote, fetchZerodhaQuoteDepth } from "@/lib/market-data/fetch-quote-client";
import { useTableSort } from "@/hooks/use-table-sort";
import SortableTh from "@/components/ui/sortable-th";
import {
  evaluateLiveBuyLimits,
  qtyForLiveNotional,
  resolveLiveCapitalLimit,
  resolveLiveOrderNotional,
} from "@/lib/live-trading/capital-limits";
import {
  buildLiveOrderRecord,
  inferLiveStrategyName,
  liveOrdersToPaperTrades,
} from "@/lib/live-trading/live-order-record";
import { attachFifoNetPnl } from "@/lib/portfolio/trade-period";
import {
  enrichTradesWithStrategy,
  computeStrategyDetailBundles,
  buildStrategyNamesBySymbol,
} from "@/lib/strategies/strategy-performance";
import { loadSettingsFromCache, saveSettingsToCache } from "@/lib/settings/cache";

type TransactionType = "BUY" | "SELL";
type ProductType = "MIS" | "CNC" | "NRML";
type OrderType = "MARKET" | "LIMIT" | "SL" | "SL-M";
type Exchange = "NSE" | "BSE";

interface Position {
  symbol: string;
  exchange: string;
  qty: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
  product: string;
  /** Day change % vs previous close (when Kite provides close_price). */
  dayChange: number;
}

interface KiteOrder {
  orderId: string;
  time: string;
  symbol: string;
  exchange?: string;
  type: string;
  side: string;
  qty: number;
  price: number;
  status: string;
  product?: string;
  strategyName?: string;
  reason?: string;
  entryPrice?: number;
  netPnl?: number;
  /** From Firestore history (prior days) — not on today's Kite book. */
  fromHistory?: boolean;
}

/** Kite sends IST datetimes without offset; pin +05:30 so the day label is correct. */
function normalizeKiteTimestamp(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
  if (m) {
    const time = m[2].length === 5 ? `${m[2]}:00` : m[2];
    return `${m[1]}T${time}+05:30`;
  }
  return s;
}

interface Holding {
  symbol: string;
  exchange: string;
  qty: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
  invested: number;
  currentValue: number;
  pnlPercent: number;
  dayChange: number;
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
  priceNote?: string;
  source?: string;
}

interface ConnectedAccount extends ZerodhaAccount {
  connected: boolean;
}

interface AccountFunds {
  available: number;
  used: number;
  net: number;
  openingBalance: number;
}

const STOCK_LIST: { symbol: string; name: string }[] = [
  { symbol: "RELIANCE", name: "Reliance Industries" },
  { symbol: "TCS", name: "Tata Consultancy Services" },
  { symbol: "HDFCBANK", name: "HDFC Bank" },
  { symbol: "INFY", name: "Infosys" },
  { symbol: "ICICIBANK", name: "ICICI Bank" },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever" },
  { symbol: "ITC", name: "ITC Limited" },
  { symbol: "SBIN", name: "State Bank of India" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel" },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank" },
  { symbol: "LT", name: "Larsen & Toubro" },
  { symbol: "AXISBANK", name: "Axis Bank" },
  { symbol: "MARUTI", name: "Maruti Suzuki" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance" },
  { symbol: "TITAN", name: "Titan Company" },
  { symbol: "SUNPHARMA", name: "Sun Pharmaceutical" },
  { symbol: "WIPRO", name: "Wipro" },
  { symbol: "HCLTECH", name: "HCL Technologies" },
  { symbol: "TATAMOTORS", name: "Tata Motors" },
  { symbol: "TATASTEEL", name: "Tata Steel" },
];

const ERROR_MESSAGES: Record<string, string> = {
  api_key_missing: "Zerodha API key is not configured. Please add KITE_API_KEY to your environment variables.",
  auth_failed: "Zerodha authentication failed. Please try connecting again.",
  session_failed: "Failed to create Zerodha session. Your request token may have expired. Please reconnect.",
};

function LiveTradingContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const orderFormRef = useRef<HTMLDivElement>(null);

  // Multi-account state
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountFunds, setAccountFunds] = useState<Record<string, AccountFunds>>({});
  const [loadingFunds, setLoadingFunds] = useState(false);
  const accountDropdownRef = useRef<HTMLDivElement>(null);

  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [isCancellingOrder, setIsCancellingOrder] = useState<string | null>(null);
  const [isSquaringOff, setIsSquaringOff] = useState(false);

  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<KiteOrder[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [currentTime, setCurrentTime] = useState("");
  const [marketOpen, setMarketOpen] = useState(false);
  const [marketStatus, setMarketStatus] = useState("");

  const [appSettings, setAppSettings] = useState<AppSettings>(() =>
    loadSettingsFromCache()
  );
  const [symbol, setSymbol] = useState("");
  const [exchange, setExchange] = useState<Exchange>("NSE");
  const [transactionType, setTransactionType] = useState<TransactionType>("BUY");
  const [productType, setProductType] = useState<ProductType>("MIS");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [triggerPrice, setTriggerPrice] = useState("");

  const [quote, setQuote] = useState<StockQuote | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [quoteLastUpdated, setQuoteLastUpdated] = useState<Date | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [instrumentResults, setInstrumentResults] = useState<{ symbol: string; name: string }[]>([]);
  const [isSearchingInstruments, setIsSearchingInstruments] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const filteredStocks = instrumentResults.length > 0
    ? instrumentResults
    : searchInput.length > 0
      ? STOCK_LIST.filter(
          (s) =>
            s.symbol.startsWith(searchInput.toUpperCase()) ||
            s.name.toLowerCase().includes(searchInput.toLowerCase())
        ).slice(0, 15)
      : STOCK_LIST.slice(0, 15);

  const [activeTab, setActiveTab] = useState<LiveTradingTab>("holdings");
  const [strategyNamesBySymbol, setStrategyNamesBySymbol] = useState<
    Map<string, string[]>
  >(new Map());
  const [orderPanelOpen, setOrderPanelOpen] = useState(false);

  const [autoTradingEnabled, setAutoTradingEnabled] = useState(
    () => loadSettingsFromCache().liveAutoTradingEnabled === true
  );
  const [savingKillSwitch, setSavingKillSwitch] = useState(false);

  const connected = accounts.some((a) => a.kiteUserId === selectedAccountId && a.connected);
  const selectedAccount = accounts.find((a) => a.kiteUserId === selectedAccountId);
  const connectedAccounts = accounts.filter((a) => a.connected);
  const selectedFunds = selectedAccountId ? accountFunds[selectedAccountId] : undefined;

  // Close account dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target as Node)) {
        setShowAccountDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(nowISTDateTimeString());
      setMarketOpen(isMarketOpen());
      setMarketStatus(getMarketStatus());
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Load accounts when auth is ready
  useEffect(() => {
    if (!user) return;
    loadAccounts();
    void getSettings()
      .then((s) => {
        setAppSettings(s);
        saveSettingsToCache(s);
        setAutoTradingEnabled(s.liveAutoTradingEnabled === true);
        setExchange((s.defaultExchange as Exchange) || "NSE");
        setProductType((s.defaultProduct as ProductType) || "MIS");
        setOrderType((s.defaultOrderType as OrderType) || "MARKET");
      })
      .catch(() => {});
  }, [user]);

  async function toggleLiveKillSwitch(next: boolean) {
    setSavingKillSwitch(true);
    setAutoTradingEnabled(next);
    try {
      await saveSettings({ liveAutoTradingEnabled: next });
      const merged = { ...appSettings, liveAutoTradingEnabled: next };
      setAppSettings(merged);
      saveSettingsToCache(merged);
      setStatusMessage(
        next
          ? "Live auto-trading ON — cron may place real orders (also needs ENABLE_LIVE_TRADING)."
          : "Live auto-trading OFF — paper continues; no algo live orders."
      );
    } catch {
      setAutoTradingEnabled(!next);
      setErrorMessage("Could not save live kill switch. Try Settings → Live.");
    } finally {
      setSavingKillSwitch(false);
    }
  }

  const liveOrderNotional = resolveLiveOrderNotional(appSettings);
  const liveCapitalLimit = resolveLiveCapitalLimit(appSettings);
  /** Algo-only deployed ₹ — existing Zerodha holdings do not count toward the ₹50k cap. */
  const [algoDeployed, setAlgoDeployed] = useState(0);
  const liveDeployed = algoDeployed;
  const liveRemaining = Math.max(0, liveCapitalLimit - liveDeployed);
  const algoCapitalPositions = useMemo(
    () => (algoDeployed > 0 ? [{ qty: 1, avgPrice: algoDeployed }] : []),
    [algoDeployed]
  );

  useEffect(() => {
    if (!user) return;
    void getLiveAlgoQuota()
      .then((q) => setAlgoDeployed(q.deployed))
      .catch(() => setAlgoDeployed(0));
  }, [user, orders.length]);

  async function loadAccounts() {
    setLoadingAccounts(true);
    try {
      const firestoreAccounts = await getZerodhaAccounts();
      const res = await zerodhaFetch(user, "/api/zerodha/accounts");
      const data = await res.json();
      const serverAccounts: { kiteUserId: string; userName?: string; email?: string; broker?: string; connected: boolean }[] = data.accounts || [];
      const serverMap = new Map(serverAccounts.map((a) => [a.kiteUserId, a]));

      const merged: ConnectedAccount[] = firestoreAccounts.map((fa) => ({
        ...fa,
        connected: serverMap.get(fa.kiteUserId)?.connected === true,
        userName: serverMap.get(fa.kiteUserId)?.userName || fa.userName,
      }));

      // Add server-only accounts
      for (const sa of serverAccounts) {
        if (!firestoreAccounts.find((fa) => fa.kiteUserId === sa.kiteUserId)) {
          merged.push({
            kiteUserId: sa.kiteUserId,
            userName: sa.userName || "",
            email: sa.email || "",
            broker: sa.broker || "",
            connectedAt: new Date().toISOString(),
            connected: sa.connected === true,
          });
        }
      }

      setAccounts(merged);

      // Auto-select first connected account
      const firstConnected = merged.find((a) => a.connected);
      if (firstConnected && !selectedAccountId) {
        setSelectedAccountId(firstConnected.kiteUserId);
      }
    } catch (e) {
      console.error("Error loading accounts:", e);
    } finally {
      setLoadingAccounts(false);
      setIsCheckingAuth(false);
    }
  }

  const fetchAccountFunds = useCallback(async (accountIds: string[]) => {
    if (accountIds.length === 0) return;
    setLoadingFunds(true);
    try {
      const results = await Promise.all(
        accountIds.map(async (id) => {
          try {
            const res = await zerodhaFetch(
              user,
              `/api/zerodha/margins?accountId=${id}`
            );
            if (!res.ok) return null;
            const data = await res.json();
            return {
              id,
              funds: {
                available: data.available ?? 0,
                used: data.used ?? 0,
                net: data.net ?? 0,
                openingBalance: data.openingBalance ?? 0,
              } as AccountFunds,
            };
          } catch {
            return null;
          }
        })
      );
      const next: Record<string, AccountFunds> = {};
      for (const r of results) {
        if (r) next[r.id] = r.funds;
      }
      setAccountFunds((prev) => ({ ...prev, ...next }));
    } finally {
      setLoadingFunds(false);
    }
  }, [user]);

  useEffect(() => {
    const connectedIds = accounts.filter((a) => a.connected).map((a) => a.kiteUserId);
    if (connectedIds.length > 0) {
      fetchAccountFunds(connectedIds);
    }
  }, [accounts, fetchAccountFunds]);

  useEffect(() => {
    const error = searchParams.get("error");
    if (error && ERROR_MESSAGES[error]) {
      setErrorMessage(ERROR_MESSAGES[error]);
      setIsCheckingAuth(false);
    }
  }, [searchParams]);

  const apiQuery = selectedAccountId ? `accountId=${selectedAccountId}` : "";

  const fetchPositions = useCallback(async () => {
    if (!selectedAccountId) return;
    try {
      const res = await zerodhaFetch(user, `/api/zerodha/positions?${apiQuery}`);
      if (!res.ok) return;
      const data = await res.json();
      const mapped: Position[] = (data.positions?.net || []).map((p: any) => {
        const ltp = Number(p.last_price) || 0;
        const close = Number(p.close_price) || 0;
        const dayChange =
          close > 0 ? ((ltp - close) / close) * 100 : 0;
        return {
          symbol: p.tradingsymbol,
          exchange: String(p.exchange || "NSE").toUpperCase(),
          qty: Number(p.quantity) || 0,
          avgPrice: Number(p.average_price) || 0,
          ltp,
          pnl: Number(p.pnl) || 0,
          product: p.product || "CNC",
          dayChange,
        };
      });
      setPositions(mapped.filter((p) => p.qty !== 0));
    } catch { /* ignore */ }
  }, [selectedAccountId, apiQuery, user]);

  const fetchOrders = useCallback(async () => {
    if (!selectedAccountId) return;
    try {
      const [res, liveFsRaw, strategies] = await Promise.all([
        zerodhaFetch(user, `/api/zerodha/orders?${apiQuery}`),
        // Dedicated LIVE query — paper fills must not crowd out older live history.
        getFirestoreLiveOrders(2000).catch(() =>
          getFirestoreOrders(2000)
            .then((rows) => rows.filter((o) => o.mode === "LIVE"))
            .catch(() => [])
        ),
        getActiveStrategies().catch(() => []),
      ]);
      setStrategyNamesBySymbol(buildStrategyNamesBySymbol(strategies));
      const data = res.ok ? await res.json() : { orders: [] };
      const liveFs = liveFsRaw.filter(
        (o) => String(o.mode || "LIVE").toUpperCase() !== "PAPER"
      );
      const byOrderId = new Map(
        liveFs
          .filter((o) => o.orderId)
          .map((o) => [String(o.orderId), o] as const)
      );
      // Latest known strategy per symbol from saved LIVE history (orderId may not match Kite).
      const strategyBySymbol = new Map<string, string>();
      for (const o of [...liveFs].sort((a, b) =>
        String(b.time || b.date || "").localeCompare(String(a.time || a.date || ""))
      )) {
        const sym = String(o.symbol || "").toUpperCase();
        const name = inferLiveStrategyName(o.strategyName, o.reason);
        if (sym && name && name !== "Manual" && !strategyBySymbol.has(sym)) {
          strategyBySymbol.set(sym, name);
        }
      }
      const kiteMapped: KiteOrder[] = (data.orders || []).map((o: any) => {
        const orderId = String(o.order_id || "");
        const fs = orderId ? byOrderId.get(orderId) : undefined;
        const tag = String(o.tag || "").trim();
        const symbol = String(o.tradingsymbol || "").toUpperCase();
        const strategyName = inferLiveStrategyName(
          fs?.strategyName ||
            (tag && tag.toLowerCase() !== "manual" ? tag : undefined) ||
            strategyBySymbol.get(symbol),
          fs?.reason
        );
        const kitePx = Number(o.average_price || o.price) || 0;
        const fsPx = Number(fs?.price) || 0;
        return {
          orderId,
          time: normalizeKiteTimestamp(
            String(o.order_timestamp || o.exchange_timestamp || "")
          ),
          symbol,
          exchange: o.exchange || fs?.exchange || "NSE",
          type: o.order_type,
          side: o.transaction_type,
          qty: o.filled_quantity || o.quantity,
          // Prefer real fill price; fall back to our saved hint when Kite avg is 0.
          price: kitePx > 0 ? kitePx : fsPx,
          status: o.status,
          product: o.product || fs?.product || "CNC",
          strategyName,
          reason: fs?.reason,
          entryPrice:
            typeof fs?.entryPrice === "number" ? fs.entryPrice : undefined,
          netPnl: typeof fs?.netPnl === "number" ? fs.netPnl : undefined,
          fromHistory: false,
        };
      });
      const kiteIds = new Set(
        kiteMapped.map((o) => o.orderId).filter(Boolean)
      );
      // Zerodha day book is today-only — keep prior LIVE fills from our history.
      const historyMapped: KiteOrder[] = liveFs
        .filter((o) => !o.orderId || !kiteIds.has(o.orderId))
        .map((o) => ({
          orderId: o.orderId || o.id || "",
          time: normalizeKiteTimestamp(o.time || o.date || ""),
          symbol: o.symbol,
          exchange: o.exchange || "NSE",
          type: o.orderType || "MARKET",
          side: o.side,
          qty: o.qty,
          price: o.price,
          status: o.status || "COMPLETE",
          product: o.product || "CNC",
          strategyName: inferLiveStrategyName(o.strategyName, o.reason),
          reason: o.reason,
          entryPrice:
            typeof o.entryPrice === "number" ? o.entryPrice : undefined,
          netPnl: typeof o.netPnl === "number" ? o.netPnl : undefined,
          fromHistory: true,
        }));
      const merged = [...kiteMapped, ...historyMapped].sort((a, b) => {
        const tb = parseDateTimeMs(b.time);
        const ta = parseDateTimeMs(a.time);
        return tb - ta;
      });
      setOrders(merged);
    } catch { /* ignore */ }
  }, [selectedAccountId, apiQuery, user]);

  const fetchHoldings = useCallback(async () => {
    if (!selectedAccountId) return;
    try {
      const res = await zerodhaFetch(user, `/api/zerodha/holdings?${apiQuery}`);
      if (!res.ok) return;
      const data = await res.json();
      const mapped: Holding[] = (data.holdings || [])
        .map((h: any) => {
          const qty = Number(h.quantity) || 0;
          const avgPrice = Number(h.average_price) || 0;
          const ltp = Number(h.last_price) || 0;
          const mark = ltp > 0 ? ltp : avgPrice;
          const invested = qty * avgPrice;
          const currentValue = qty * mark;
          const pnl = currentValue - invested;
          const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;
          return {
            symbol: String(h.tradingsymbol || "").toUpperCase(),
            exchange: h.exchange || "NSE",
            qty,
            avgPrice,
            ltp: mark,
            pnl,
            invested,
            currentValue,
            pnlPercent,
            dayChange: Number(h.day_change_percentage) || 0,
          } satisfies Holding;
        })
        .filter((h: Holding) => h.qty > 0);
      setHoldings(mapped);
    } catch { /* ignore */ }
  }, [selectedAccountId, apiQuery, user]);

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
    async (sym: string) => {
      if (!sym.trim()) return;

      setIsLoadingQuote(true);
      try {
        let data = await fetchMarketQuote(sym.trim(), exchange);

        if (connected && selectedAccountId) {
          const depth = await fetchZerodhaQuoteDepth(sym.trim(), exchange, selectedAccountId);
          if (depth?.buyDepth?.length || depth?.sellDepth?.length) {
            data = data
              ? {
                  ...data,
                  buyDepth: depth.buyDepth,
                  sellDepth: depth.sellDepth,
                  lowerCircuit: depth.lowerCircuit,
                  upperCircuit: depth.upperCircuit,
                  totalBuyQty: depth.totalBuyQty,
                  totalSellQty: depth.totalSellQty,
                }
              : depth;
          }
        }

        if (data?.lastPrice && data.lastPrice > 0) {
          setQuote(data as StockQuote);
          setQuoteLastUpdated(new Date());
          return;
        }

        const fallback = buildQuoteFromHolding(sym.trim(), exchange);
        setQuote(fallback);
        if (!fallback) setQuote(null);
      } catch {
        const fallback = buildQuoteFromHolding(sym.trim(), exchange);
        setQuote(fallback);
      } finally {
        setIsLoadingQuote(false);
      }
    },
    [connected, selectedAccountId, exchange, buildQuoteFromHolding]
  );

  const searchInstruments = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 1) {
      setInstrumentResults([]);
      return;
    }
    setIsSearchingInstruments(true);
    try {
      const res = await fetch(`/api/zerodha/instruments?search=${encodeURIComponent(query)}&exchange=${exchange}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setInstrumentResults(data.map((d: any) => ({ symbol: d.tradingsymbol, name: d.name })));
        } else {
          setInstrumentResults([]);
        }
      }
    } catch {
      setInstrumentResults([]);
    } finally {
      setIsSearchingInstruments(false);
    }
  }, [exchange]);

  const handleSearchInputChange = (value: string) => {
    setSearchInput(value);
    setShowSuggestions(true);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => searchInstruments(value), 300);
  };

  const handleSelectSymbol = (sym: string) => {
    setSymbol(sym);
    setSearchInput(sym);
    setShowSuggestions(false);
    fetchQuote(sym);
  };

  useEffect(() => {
    if (!symbol.trim()) return;
    const timer = setTimeout(() => fetchQuote(symbol), 300);
    return () => clearTimeout(timer);
  }, [symbol, exchange, fetchQuote]);

  useEffect(() => {
    if (!symbol.trim()) return;
    const interval = setInterval(() => fetchQuote(symbol), 15000);
    return () => clearInterval(interval);
  }, [symbol, exchange, fetchQuote]);

  // Reload data when selected account changes
  useEffect(() => {
    if (!connected) {
      setPositions([]);
      setOrders([]);
      setHoldings([]);
      return;
    }
    fetchPositions();
    fetchOrders();
    fetchHoldings();

    const interval = setInterval(() => {
      fetchPositions();
      fetchOrders();
      fetchHoldings();
    }, 30000);
    return () => clearInterval(interval);
  }, [connected, selectedAccountId, fetchPositions, fetchOrders, fetchHoldings]);

  const netPnl = positions.reduce((sum, p) => sum + p.pnl, 0);
  const holdingsTotals = useMemo(() => {
    return holdings.reduce(
      (acc, h) => {
        const mark = h.ltp > 0 ? h.ltp : h.avgPrice;
        const invested = h.qty * h.avgPrice;
        const currentValue = h.qty * mark;
        return {
          invested: acc.invested + invested,
          currentValue: acc.currentValue + currentValue,
          pnl: acc.pnl + (currentValue - invested),
        };
      },
      { invested: 0, currentValue: 0, pnl: 0 }
    );
  }, [holdings]);
  const holdingsPnlPercent =
    holdingsTotals.invested > 0 ? (holdingsTotals.pnl / holdingsTotals.invested) * 100 : 0;

  const enrichOptions = useMemo(
    () => ({ strategyNamesBySymbol }),
    [strategyNamesBySymbol]
  );

  const livePaperTrades = useMemo(
    () => liveOrdersToPaperTrades(orders),
    [orders]
  );

  const liveRealizedPnl = useMemo(() => {
    const withPnl = attachFifoNetPnl(livePaperTrades);
    return withPnl.reduce(
      (sum, t) =>
        t.side === "SELL" && typeof t.netPnl === "number" ? sum + t.netPnl : sum,
      0
    );
  }, [livePaperTrades]);

  const enrichedLiveTrades = useMemo(
    () =>
      enrichTradesWithStrategy(livePaperTrades, enrichOptions).map((t) => {
        const src = orders.find(
          (o) =>
            (o.orderId && t.id === `live-${o.orderId}`) ||
            (o.symbol === t.symbol &&
              o.side === t.side &&
              o.qty === t.qty &&
              Math.abs((o.price || 0) - t.price) < 0.01)
        );
        return {
          ...t,
          orderId: src?.orderId,
          status: src?.status,
          orderType: src?.type,
          fromHistory: src?.fromHistory,
        };
      }),
    [livePaperTrades, enrichOptions, orders]
  );

  const strategyDetails = useMemo(
    () =>
      computeStrategyDetailBundles(
        livePaperTrades,
        holdings.map((h) => ({
          symbol: h.symbol,
          exchange: h.exchange,
          qty: h.qty,
          avgPrice: h.avgPrice,
          ltp: h.ltp,
        })),
        { ...enrichOptions, includeManual: true }
      ),
    [livePaperTrades, holdings, enrichOptions]
  );

  /** Latest BUY strategy labels per symbol (for Holdings Strategies column). */
  const buyStrategiesBySymbol = useMemo(() => {
    const map = new Map<string, { names: string[]; unknown: number }>();
    const chronological = [...enrichedLiveTrades].sort(
      (a, b) => tradeExecutedAtMs(a) - tradeExecutedAtMs(b)
    );
    for (const t of chronological) {
      if (t.side !== "BUY") continue;
      map.set(
        `${t.symbol.toUpperCase()}:${(t.exchange || "NSE").toUpperCase()}`,
        {
          names: t.displayStrategyNames,
          unknown: t.unknownStrategyCount ?? 0,
        }
      );
    }
    return map;
  }, [enrichedLiveTrades]);

  const positionsSort = useTableSort({ key: "pnl", dir: "desc" });
  const sortedPositions = useMemo(
    () =>
      positionsSort.sortRows(positions, {
        symbol: (p) => p.symbol,
        qty: (p) => p.qty,
        avg: (p) => p.avgPrice,
        ltp: (p) => p.ltp,
        invested: (p) => Math.abs(p.qty) * p.avgPrice,
        value: (p) => {
          const mark = p.ltp > 0 ? p.ltp : p.avgPrice;
          return Math.abs(p.qty) * mark;
        },
        pnl: (p) => p.pnl,
        pnlPct: (p) => {
          const invested = Math.abs(p.qty) * p.avgPrice;
          if (invested <= 0) return 0;
          return (p.pnl / invested) * 100;
        },
        dayPct: (p) => p.dayChange,
        product: (p) => p.product,
      }),
    [positions, positionsSort.sortRows]
  );

  const holdingsSort = useTableSort({ key: "pnl", dir: "desc" });
  const sortedHoldings = useMemo(
    () =>
      holdingsSort.sortRows(holdings, {
        symbol: (h) => h.symbol,
        qty: (h) => h.qty,
        avg: (h) => h.avgPrice,
        ltp: (h) => h.ltp,
        invested: (h) => h.qty * h.avgPrice,
        value: (h) => {
          const mark = h.ltp > 0 ? h.ltp : h.avgPrice;
          return h.qty * mark;
        },
        pnl: (h) => {
          const mark = h.ltp > 0 ? h.ltp : h.avgPrice;
          return h.qty * mark - h.qty * h.avgPrice;
        },
        pnlPct: (h) => {
          const invested = h.qty * h.avgPrice;
          const mark = h.ltp > 0 ? h.ltp : h.avgPrice;
          return invested > 0 ? ((h.qty * mark - invested) / invested) * 100 : 0;
        },
        dayPct: (h) => h.dayChange,
      }),
    [holdings, holdingsSort.sortRows]
  );

  useEffect(() => {
    if (transactionType !== "BUY") return;
    const px =
      orderType === "LIMIT" || orderType === "SL"
        ? parseFloat(price)
        : quote?.lastPrice ?? 0;
    if (!(px > 0)) return;
    if (quantity.trim() !== "") return;
    const qty = qtyForLiveNotional(
      Math.min(liveOrderNotional, liveRemaining || liveOrderNotional),
      px
    );
    if (qty > 0) setQuantity(String(qty));
  }, [
    transactionType,
    orderType,
    price,
    quote?.lastPrice,
    liveOrderNotional,
    liveRemaining,
    quantity,
    symbol,
  ]);

  const handlePlaceOrder = async () => {
    if (!symbol.trim() || !quantity) return;

    if (!connected) {
      setErrorMessage("Please connect to Zerodha first before placing live orders.");
      return;
    }

    const qtyNum = parseInt(quantity, 10);
    const refPrice =
      orderType === "LIMIT" || orderType === "SL"
        ? parseFloat(price)
        : quote?.lastPrice || parseFloat(price) || 0;
    const limitCheck = evaluateLiveBuyLimits({
      side: transactionType,
      qty: qtyNum,
      price: refPrice > 0 ? refPrice : 0,
      settings: appSettings,
      positions: algoCapitalPositions,
      holdings: [],
    });
    if (!limitCheck.ok) {
      setErrorMessage(limitCheck.error || "Live capital limit blocked this order.");
      return;
    }

    setIsPlacingOrder(true);
    setStatusMessage("");
    setErrorMessage("");

    try {
      const body: Record<string, any> = {
        symbol: symbol.trim().toUpperCase(),
        exchange,
        side: transactionType,
        orderType: orderType,
        quantity: qtyNum,
        product: productType,
        accountId: selectedAccountId,
        estimatedPrice: refPrice > 0 ? refPrice : undefined,
      };

      if (orderType === "LIMIT" || orderType === "SL") {
        body.price = parseFloat(price);
      }
      if (orderType === "SL" || orderType === "SL-M") {
        body.triggerPrice = parseFloat(triggerPrice);
      }

      const res = await fetch("/api/zerodha/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "Failed to place order. Please try again.");
        return;
      }

      const accountLabel = selectedAccount?.label || selectedAccount?.userName || selectedAccountId;
      setStatusMessage(`Order placed on ${accountLabel}! Order ID: ${data.orderId}`);
      if (data.orderId) {
        void saveOrder(
          buildLiveOrderRecord({
            orderId: String(data.orderId),
            symbol: symbol.trim().toUpperCase(),
            exchange,
            side: transactionType,
            qty: qtyNum,
            price: refPrice > 0 ? refPrice : 0,
            product: productType,
            orderType,
            status: "COMPLETE",
            strategyName: "Manual",
            reason: `Manual ${transactionType}`,
          })
        );
      }
      setSymbol("");
      setQuantity("");
      setPrice("");
      setTriggerPrice("");
      setSearchInput("");
      setOrderPanelOpen(false);

      setTimeout(() => {
        fetchOrders();
        fetchPositions();
        fetchHoldings();
      }, 2000);
    } catch (err: any) {
      setErrorMessage(err.message || "Network error. Please check your connection.");
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const handleExitPosition = (pos: Position) => {
    setOrderPanelOpen(true);
    setSymbol(pos.symbol);
    setSearchInput(pos.symbol);
    setTransactionType(pos.qty > 0 ? "SELL" : "BUY");
    setQuantity(Math.abs(pos.qty).toString());
    setProductType(pos.product as ProductType);
    setOrderType("MARKET");
    setPrice("");
    setTriggerPrice("");
    orderFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleHoldingTrade = (holding: Holding, side: TransactionType) => {
    setSymbol(holding.symbol);
    setSearchInput(holding.symbol);
    setExchange(holding.exchange as Exchange);
    setTransactionType(side);
    setQuantity(side === "SELL" ? String(holding.qty) : "1");
    setProductType("CNC");
    setOrderType("MARKET");
    setPrice("");
    setTriggerPrice("");
    orderFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSquareOffAll = async () => {
    if (!connected || positions.length === 0) return;
    const accountLabel = selectedAccount?.label || selectedAccount?.userName || selectedAccountId;
    if (!window.confirm(`Square off all ${positions.length} position(s) on ${accountLabel}?`)) return;

    setIsSquaringOff(true);
    setErrorMessage("");
    let successCount = 0;
    let failCount = 0;

    for (const pos of positions) {
      try {
        const body = {
          symbol: pos.symbol,
          exchange: "NSE",
          side: pos.qty > 0 ? "SELL" : "BUY",
          orderType: "MARKET",
          quantity: Math.abs(pos.qty),
          product: pos.product,
          accountId: selectedAccountId,
        };
        const res = await fetch("/api/zerodha/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) successCount++;
        else failCount++;
      } catch {
        failCount++;
      }
    }

    setIsSquaringOff(false);
    if (failCount === 0) {
      setStatusMessage(`All ${successCount} position(s) squared off successfully.`);
    } else {
      setErrorMessage(`Squared off ${successCount} position(s), ${failCount} failed.`);
    }
    setTimeout(() => { fetchOrders(); fetchPositions(); }, 2000);
  };

  const handleCancelOrder = async (order: KiteOrder) => {
    if (!order.orderId) return;
    if (!window.confirm(`Cancel order for ${order.symbol} (${order.side} ${order.qty})?`)) return;

    setIsCancellingOrder(order.orderId);
    setErrorMessage("");
    try {
      const res = await fetch("/api/zerodha/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.orderId, accountId: selectedAccountId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || "Failed to cancel order.");
      } else {
        setStatusMessage(`Order ${order.orderId} cancelled successfully.`);
        setTimeout(() => fetchOrders(), 1500);
      }
    } catch {
      setErrorMessage("Network error cancelling order.");
    } finally {
      setIsCancellingOrder(null);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      {/* Page header — mirrors Paper Trading layout (green = live) */}
      <div className="border-b border-emerald-200/80 bg-emerald-50/60 px-3 sm:px-6 py-4 sm:py-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
              Real money · Zerodha
            </p>
            <h1 className="text-2xl md:text-3xl font-bold text-emerald-950">
              Live Trading
            </h1>
            <p className="text-sm text-emerald-900/80 mt-1">
              Place real orders and monitor positions — separate capital from paper
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/settings?tab=live-rules"
              className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-950 hover:bg-emerald-100"
            >
              Live Rules
            </Link>
            <Link
              href="/settings?tab=live"
              className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-950 hover:bg-emerald-100"
            >
              Live Settings
            </Link>
            <LiveAutoSwitch
              enabled={autoTradingEnabled}
              saving={savingKillSwitch}
              onToggle={(next) => void toggleLiveKillSwitch(next)}
            />
            <button
              type="button"
              onClick={() => {
                setTransactionType("BUY");
                setOrderPanelOpen(true);
                setTimeout(
                  () =>
                    orderFormRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "nearest",
                    }),
                  50
                );
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 shrink-0"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              <span className="sm:hidden">Order</span>
              <span className="hidden sm:inline">Place Order</span>
            </button>
          </div>
        </div>

        <div className="mb-4 rounded-lg border border-emerald-200 bg-white/80 px-4 py-3 text-xs text-emerald-950">
          <span className="font-medium">Algo sizing: </span>
          ₹{liveOrderNotional.toLocaleString("en-IN")} / trade · ₹
          {liveCapitalLimit.toLocaleString("en-IN")} algo cap · algo deployed ₹
          {Math.round(liveDeployed).toLocaleString("en-IN")} · remaining ₹
          {Math.round(liveRemaining).toLocaleString("en-IN")}
          {" "}
          (existing holdings do not count)
          {" · "}
          <Link href="/settings?tab=live" className="underline font-medium">
            Edit limits
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard
            label="Available cash"
            primary={formatCurrency(selectedFunds?.available ?? 0)}
            hint={connected ? selectedAccountId || "Zerodha" : "Connect account"}
            icon={IndianRupee}
            colorClass="text-text-primary"
            className="border-emerald-200 bg-white"
          />
          <StatCard
            label="Margin used"
            primary={formatCurrency(selectedFunds?.used ?? 0)}
            hint={`Net ${formatCurrency(selectedFunds?.net ?? 0)}`}
            icon={Wallet}
            colorClass="text-text-primary"
            className="border-emerald-200 bg-white"
          />
          <StatCard
            label="Realized P&L (algo)"
            primary={formatCurrency(liveRealizedPnl)}
            hint="Closed LIVE fills (FIFO / stored cost)"
            icon={liveRealizedPnl >= 0 ? TrendingUp : TrendingDown}
            colorClass={
              liveRealizedPnl >= 0 ? "text-emerald-700" : "text-red-700"
            }
            className="border-emerald-200 bg-white"
          />
          <StatCard
            label="Day P&L (positions)"
            primary={formatCurrency(netPnl)}
            hint={`${positions.length} open position${positions.length === 1 ? "" : "s"}`}
            icon={netPnl >= 0 ? TrendingUp : TrendingDown}
            colorClass={netPnl >= 0 ? "text-emerald-700" : "text-red-700"}
            className="border-emerald-200 bg-white"
          />
          <StatCard
            label="Holdings P&L"
            primary={formatCurrency(holdingsTotals.pnl)}
            secondary={formatPercent(holdingsPnlPercent)}
            hint={`Invested ${formatCurrency(holdingsTotals.invested)}`}
            icon={Wallet}
            colorClass={
              holdingsTotals.pnl >= 0 ? "text-emerald-700" : "text-red-700"
            }
            className="border-emerald-200 bg-white"
          />
        </div>
      </div>

      {/* Account Selector Banner */}
      <div className="bg-bg-secondary border-b border-emerald-200/50 px-3 sm:px-6 py-2.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Users className="h-4 w-4 text-emerald-800 hidden sm:block" />
              <span className="text-xs sm:text-sm text-text-secondary">Account:</span>
            </div>

            {loadingAccounts ? (
              <div className="flex items-center gap-2 text-text-secondary text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading accounts...
              </div>
            ) : connectedAccounts.length === 0 ? (
              <a
                href="/api/zerodha/login"
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded transition-colors"
              >
                Connect Zerodha Account
              </a>
            ) : (
              <div className="relative" ref={accountDropdownRef}>
                <button
                  onClick={() => setShowAccountDropdown(!showAccountDropdown)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors",
                    connected
                      ? "border-border bg-bg-elevated text-text-primary hover:bg-bg-tertiary"
                      : "border-emerald-400 bg-emerald-50 text-emerald-950 hover:bg-emerald-100"
                  )}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      connected ? "bg-emerald-600" : "bg-emerald-500"
                    )}
                  />
                  <span className="text-text-primary">
                    {selectedAccount?.label ||
                      selectedAccount?.userName ||
                      selectedAccountId ||
                      "Select Account"}
                  </span>
                  <span className="text-xs text-text-tertiary">
                    ({selectedAccountId})
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-text-tertiary" />
                </button>

                {showAccountDropdown && (
                  <div className="absolute z-50 top-full left-0 mt-1 w-72 bg-bg-elevated border border-border rounded-lg shadow-2xl overflow-hidden">
                    <div className="p-2 border-b border-border/50">
                      <p className="text-xs text-text-tertiary px-2 py-1">
                        {connectedAccounts.length} of {accounts.length} account{accounts.length !== 1 ? "s" : ""} connected
                      </p>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {accounts.map((account) => (
                        <button
                          key={account.kiteUserId}
                          onClick={() => {
                            setSelectedAccountId(account.kiteUserId);
                            setShowAccountDropdown(false);
                            setPositions([]);
                            setOrders([]);
                            setHoldings([]);
                          }}
                          disabled={!account.connected}
                          className={cn(
                            "w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors",
                            account.kiteUserId === selectedAccountId
                              ? "bg-accent/20"
                              : "hover:bg-bg-tertiary/50",
                            !account.connected && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full shrink-0",
                              account.connected ? "bg-emerald-400" : "bg-border-light"
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-text-primary truncate">
                              {account.label || account.userName || account.kiteUserId}
                            </p>
                            <p className="text-xs text-text-tertiary">
                              {account.kiteUserId}
                              {!account.connected && " · Session expired"}
                            </p>
                            {account.connected && accountFunds[account.kiteUserId] && (
                              <p className="text-xs text-text-primary mt-0.5 tabular-nums">
                                Available {formatCurrency(accountFunds[account.kiteUserId].available)}
                              </p>
                            )}
                          </div>
                          {account.kiteUserId === selectedAccountId && (
                            <CheckCircle2 className="h-4 w-4 text-accent shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="p-2 border-t border-border/50">
                      <a
                        href="/api/zerodha/login"
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-accent hover:bg-accent-muted rounded transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Another Account
                      </a>
                      <a
                        href="/settings"
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-secondary hover:bg-bg-tertiary/50 rounded transition-colors"
                      >
                        <SettingsIcon className="h-3.5 w-3.5" />
                        Manage Accounts
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {connected && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 rounded-md bg-bg-elevated border border-border px-3 py-1.5">
                <Wallet className="h-3.5 w-3.5 text-text-secondary" />
                <span className="text-xs text-text-secondary">Available</span>
                <span className="text-sm font-semibold text-text-primary tabular-nums">
                  {loadingFunds && !selectedFunds
                    ? "..."
                    : formatCurrency(selectedFunds?.available ?? 0)}
                </span>
              </div>
              {selectedFunds && selectedFunds.used > 0 && (
                <span className="text-xs text-text-tertiary">
                  Used {formatCurrency(selectedFunds.used)}
                </span>
              )}
              {connectedAccounts.length > 1 && (
                <span className="text-xs text-text-tertiary">
                  {connectedAccounts.length} accounts active
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Market Status Bar */}
      <div className="bg-bg-secondary border-b border-border px-3 sm:px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span
                className={cn(
                  "absolute inline-flex h-full w-full rounded-full opacity-75",
                  marketOpen ? "bg-green-400 animate-ping" : "bg-red-400"
                )}
              />
              <span
                className={cn(
                  "relative inline-flex rounded-full h-2.5 w-2.5",
                  marketOpen ? "bg-green-500" : "bg-red-500"
                )}
              />
            </span>
            <span className={cn("text-sm font-medium", marketOpen ? "text-emerald-700" : "text-red-400")}>
              NSE: {marketStatus}
            </span>
          </div>
          <span className="text-text-tertiary text-xs hidden sm:inline">|</span>
          <span className="text-text-secondary text-xs hidden sm:inline">Trading Hours: 9:15 AM - 3:30 PM IST</span>
        </div>
        <div className="flex items-center gap-2 text-text-secondary text-sm">
          <Clock className="h-4 w-4" />
          <span>{currentTime} IST</span>
        </div>
      </div>

      {/* Error/Success Banners */}
      {errorMessage && (
        <div className="bg-red-900/40 border-b border-red-700/50 px-3 sm:px-6 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-red-400 shrink-0" />
            <span className="text-red-200 text-sm font-medium">{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage("")} className="text-red-400 hover:text-red-300 text-sm">
            Dismiss
          </button>
        </div>
      )}

      {statusMessage && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-3 sm:px-6 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0" />
            <span className="text-emerald-950 text-sm font-medium">{statusMessage}</span>
          </div>
          <button
            onClick={() => setStatusMessage("")}
            className="text-emerald-800 hover:text-emerald-950 text-sm font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="p-3 sm:p-4 md:p-6 lg:p-8 space-y-4 sm:space-y-6">
        {/* No Account Warning */}
        {!isCheckingAuth && connectedAccounts.length === 0 && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-emerald-800" />
              <span className="text-emerald-950 text-sm font-medium">
                No Zerodha accounts connected. Connect an account to start live trading.
              </span>
            </div>
            <a
              href="/api/zerodha/login"
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded transition-colors"
            >
              Connect to Zerodha
            </a>
          </div>
        )}

        <LiveTabBar
          active={activeTab}
          onChange={setActiveTab}
          counts={{
            holdings: holdings.length,
            positions: positions.length,
            trades: enrichedLiveTrades.length,
            strategies: strategyDetails.length,
          }}
        />

        {/* Compact order drawer (like paper Place Order panel) */}
        {orderPanelOpen && (
          <div className="fixed inset-0 z-40 flex justify-end">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              aria-label="Close order panel"
              onClick={() => setOrderPanelOpen(false)}
            />
            <div
              ref={orderFormRef}
              className="relative z-50 h-full w-full max-w-md overflow-y-auto border-l border-emerald-200 bg-bg-primary shadow-2xl"
            >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-bg-primary px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <Zap className="h-4 w-4 text-emerald-700 shrink-0" />
                <h2 className="text-sm font-semibold text-text-primary truncate">
                  Place live order
                </h2>
                {selectedAccount && (
                  <span className="text-[10px] bg-bg-tertiary text-text-secondary px-2 py-0.5 rounded truncate">
                    {selectedAccount.label ||
                      selectedAccount.userName ||
                      selectedAccountId}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOrderPanelOpen(false)}
                className="rounded-md p-1.5 text-text-tertiary hover:bg-bg-tertiary hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4">

              {/* Warning */}
              <div className="mb-5 flex items-start gap-2 rounded-lg border border-red-500/35 bg-red-500/10 p-3">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                <p className="text-xs leading-relaxed text-text-secondary">
                  This will place{" "}
                  <span className="font-semibold text-red-400">REAL</span> orders on
                  Zerodha. Use with caution.
                </p>
              </div>

              <div className="space-y-4">
                {/* Symbol search */}
                <div className="relative">
                  <label className="text-xs text-text-secondary mb-1 block">Symbol</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
                    <input
                      type="text"
                      value={searchInput}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        setSearchInput(val);
                        setSymbol(val);
                        handleSearchInputChange(val);
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      placeholder="Search symbol or company..."
                      className="w-full bg-bg-primary border border-border rounded-md py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
                    />
                    {(isLoadingQuote || isSearchingInstruments) && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-accent animate-spin" />
                    )}
                  </div>
                  {showSuggestions && filteredStocks.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-bg-elevated border border-border rounded-md shadow-xl max-h-48 overflow-y-auto">
                      {filteredStocks.map((s) => (
                        <button
                          key={s.symbol}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleSelectSymbol(s.symbol)}
                          className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-accent/20 hover:text-text-primary transition-colors flex items-center justify-between"
                        >
                          <span className="font-medium">{s.symbol}</span>
                          <span className="text-xs text-text-tertiary ml-2 truncate">{s.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected symbol price (quick view) */}
                {symbol.trim() && (
                  <div className="rounded-md border border-border bg-bg-primary px-3 py-2 space-y-1">
                    <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary">{symbol} · {exchange}</span>
                    {isLoadingQuote ? (
                      <span className="text-xs text-text-tertiary flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Loading price...
                      </span>
                    ) : quote ? (
                      <div className="text-right">
                        <span className={cn("text-sm font-bold", quote.changePercent >= 0 ? "text-emerald-700" : "text-red-400")}>
                          {formatCurrency(quote.lastPrice)}
                        </span>
                        <span className={cn("text-xs ml-2", quote.changePercent >= 0 ? "text-emerald-700" : "text-red-400/80")}>
                          {quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)} ({formatPercent(quote.changePercent)})
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-text-tertiary">Price unavailable</span>
                    )}
                    </div>
                    {quote?.priceNote && (
                      <p className="text-[10px] text-text-tertiary">{quote.priceNote}</p>
                    )}
                  </div>
                )}

                {/* Quote Panel */}
                {quote && (
                  <div className="bg-bg-primary border border-border rounded-md p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-text-primary">{quote.symbol}</span>
                      <span className={cn("text-lg font-bold", quote.changePercent >= 0 ? "text-emerald-700" : "text-red-400")}>
                        {formatCurrency(quote.lastPrice)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded", quote.changePercent >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-900/50 text-red-400")}>
                        {quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)} ({formatPercent(quote.changePercent)})
                      </span>
                      {quote.priceNote && (
                        <span className="text-[10px] text-text-tertiary">{quote.priceNote}</span>
                      )}
                      {quoteLastUpdated && (
                        <span className="text-[10px] text-text-tertiary">
                          Updated {formatDateTimeIST(quoteLastUpdated)}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div><span className="text-text-tertiary">Open</span><p className="text-text-secondary">{formatCurrency(quote.open)}</p></div>
                      <div><span className="text-text-tertiary">High</span><p className="text-emerald-700">{formatCurrency(quote.high)}</p></div>
                      <div><span className="text-text-tertiary">Low</span><p className="text-red-400">{formatCurrency(quote.low)}</p></div>
                      <div><span className="text-text-tertiary">Close</span><p className="text-text-secondary">{formatCurrency(quote.close)}</p></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-text-tertiary">Volume</span><p className="text-text-secondary">{(quote.volume || 0).toLocaleString("en-IN")}</p></div>
                      <div><span className="text-text-tertiary">Circuit</span><p className="text-text-secondary">{formatCurrency(quote.lowerCircuit)} - {formatCurrency(quote.upperCircuit)}</p></div>
                    </div>

                    {(quote.buyDepth.length > 0 || quote.sellDepth.length > 0) && (
                      <div>
                        <p className="text-xs text-text-tertiary mb-1.5 font-medium">Market Depth</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <div className="grid grid-cols-3 text-text-tertiary mb-1">
                              <span>Bid</span><span className="text-right">Qty</span><span className="text-right">Ord</span>
                            </div>
                            {quote.buyDepth.map((b, i) => (
                              <div key={i} className="grid grid-cols-3 text-emerald-700 py-0.5">
                                <span>{b.price.toFixed(2)}</span>
                                <span className="text-right">{b.quantity}</span>
                                <span className="text-right">{b.orders}</span>
                              </div>
                            ))}
                            <div className="mt-1 text-text-tertiary">Total: <span className="text-emerald-700">{(quote.totalBuyQty || 0).toLocaleString("en-IN")}</span></div>
                          </div>
                          <div>
                            <div className="grid grid-cols-3 text-text-tertiary mb-1">
                              <span>Ask</span><span className="text-right">Qty</span><span className="text-right">Ord</span>
                            </div>
                            {quote.sellDepth.map((s, i) => (
                              <div key={i} className="grid grid-cols-3 text-red-400/80 py-0.5">
                                <span>{s.price.toFixed(2)}</span>
                                <span className="text-right">{s.quantity}</span>
                                <span className="text-right">{s.orders}</span>
                              </div>
                            ))}
                            <div className="mt-1 text-text-tertiary">Total: <span className="text-red-400">{(quote.totalSellQty || 0).toLocaleString("en-IN")}</span></div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Exchange */}
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Exchange</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["NSE", "BSE"] as Exchange[]).map((ex) => (
                      <button
                        key={ex}
                        onClick={() => setExchange(ex)}
                        className={cn(
                          "py-1.5 text-sm font-medium rounded-md border transition-colors",
                          exchange === ex
                            ? "bg-accent/20 border-accent text-brand"
                            : "bg-bg-primary border-border text-text-secondary hover:border-border-light"
                        )}
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Transaction Type */}
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Transaction Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setTransactionType("BUY")}
                      className={cn(
                        "py-2 text-sm font-semibold rounded-md border transition-colors",
                        transactionType === "BUY"
                          ? "bg-emerald-100 border-emerald-600 text-emerald-800"
                          : "bg-bg-primary border-border text-text-secondary hover:border-border-light"
                      )}
                    >
                      BUY
                    </button>
                    <button
                      onClick={() => setTransactionType("SELL")}
                      className={cn(
                        "py-2 text-sm font-semibold rounded-md border transition-colors",
                        transactionType === "SELL"
                          ? "bg-red-600/20 border-red-500 text-red-400"
                          : "bg-bg-primary border-border text-text-secondary hover:border-border-light"
                      )}
                    >
                      SELL
                    </button>
                  </div>
                </div>

                {/* Product Type */}
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Product Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["MIS", "CNC", "NRML"] as ProductType[]).map((pt) => (
                      <button
                        key={pt}
                        onClick={() => setProductType(pt)}
                        className={cn(
                          "py-1.5 text-xs font-medium rounded-md border transition-colors",
                          productType === pt
                            ? "bg-purple-600/20 border-purple-500 text-purple-400"
                            : "bg-bg-primary border-border text-text-secondary hover:border-border-light"
                        )}
                      >
                        {pt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Order Type */}
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Order Type</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(["MARKET", "LIMIT", "SL", "SL-M"] as OrderType[]).map((ot) => (
                      <button
                        key={ot}
                        onClick={() => setOrderType(ot)}
                        className={cn(
                          "py-1.5 text-xs font-medium rounded-md border transition-colors",
                          orderType === ot
                            ? "bg-indigo-600/20 border-indigo-500 text-indigo-400"
                            : "bg-bg-primary border-border text-text-secondary hover:border-border-light"
                        )}
                      >
                        {ot}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quantity */}
                <div>
                  <label className="text-xs text-text-secondary mb-1 block">Quantity</label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="Enter quantity"
                    className="w-full bg-bg-primary border border-border rounded-md py-2 px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
                  />
                  <p className="mt-1 text-[10px] text-text-tertiary leading-snug">
                    Per trade ≤ {formatCurrency(liveOrderNotional)} · Capital{" "}
                    {formatCurrency(liveDeployed)} / {formatCurrency(liveCapitalLimit)} · Left{" "}
                    {formatCurrency(liveRemaining)}
                  </p>
                  {transactionType === "BUY" && quote?.lastPrice ? (
                    <button
                      type="button"
                      className="mt-1 text-[11px] text-accent hover:underline"
                      onClick={() => {
                        const budget = Math.min(liveOrderNotional, liveRemaining);
                        const qty = qtyForLiveNotional(budget, quote.lastPrice);
                        setQuantity(qty > 0 ? String(qty) : "");
                      }}
                    >
                      Use default size (~{formatCurrency(Math.min(liveOrderNotional, liveRemaining))})
                    </button>
                  ) : null}
                </div>

                {/* Price (for LIMIT/SL) */}
                {(orderType === "LIMIT" || orderType === "SL") && (
                  <div>
                    <label className="text-xs text-text-secondary mb-1 block">Price</label>
                    <input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="Enter price"
                      step="0.05"
                      className="w-full bg-bg-primary border border-border rounded-md py-2 px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
                    />
                  </div>
                )}

                {/* Trigger Price (for SL/SL-M) */}
                {(orderType === "SL" || orderType === "SL-M") && (
                  <div>
                    <label className="text-xs text-text-secondary mb-1 block">Trigger Price</label>
                    <input
                      type="number"
                      value={triggerPrice}
                      onChange={(e) => setTriggerPrice(e.target.value)}
                      placeholder="Enter trigger price"
                      step="0.05"
                      className="w-full bg-bg-primary border border-border rounded-md py-2 px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent transition-colors"
                    />
                  </div>
                )}

                {/* Place Order */}
                <button
                  onClick={handlePlaceOrder}
                  disabled={isPlacingOrder || !symbol.trim() || !quantity || !connected}
                  className={cn(
                    "w-full py-2.5 rounded-md font-semibold text-sm transition-colors mt-2 flex items-center justify-center gap-2 text-white",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    transactionType === "BUY"
                      ? "bg-emerald-700 hover:bg-emerald-800"
                      : "bg-red-600 hover:bg-red-700"
                  )}
                >
                  {isPlacingOrder ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Placing Order...
                    </>
                  ) : (
                    `Place ${transactionType} Order`
                  )}
                </button>
              </div>
            </div>
            </div>
          </div>
        )}

                {/* Positions Tab */}
                {activeTab === "positions" && (
                  <div className="card">
                    {positions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-text-tertiary">
                        <Inbox className="h-10 w-10 mb-3 text-text-tertiary" />
                        <p className="text-sm">No open positions.</p>
                        <p className="text-xs text-text-tertiary mt-1">
                          {connected ? "Place an order to see positions here." : "Connect a Zerodha account to view positions."}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-end mb-3">
                          <button
                            onClick={handleSquareOffAll}
                            disabled={isSquaringOff}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600/20 text-red-400 border border-red-700/50 rounded-md hover:bg-red-600/30 transition-colors disabled:opacity-50"
                          >
                            {isSquaringOff ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                            Square Off All
                          </button>
                        </div>
                        <div className="overflow-x-auto -mx-5">
                          <table className="w-full text-sm min-w-[760px]">
                            <thead>
                              <tr className="border-b border-border">
                                <SortableTh
                                  sortKey="symbol"
                                  activeKey={positionsSort.sortKey}
                                  direction={positionsSort.sortDir}
                                  onSort={positionsSort.toggleSort}
                                  className="py-3 pl-5 pr-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                                >
                                  Symbol
                                </SortableTh>
                                <th className="py-3 px-2 text-left text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                                  Strategies
                                </th>
                                <SortableTh
                                  sortKey="qty"
                                  activeKey={positionsSort.sortKey}
                                  direction={positionsSort.sortDir}
                                  onSort={positionsSort.toggleSort}
                                  align="right"
                                  className="py-3 px-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                                >
                                  Qty
                                </SortableTh>
                                <SortableTh
                                  sortKey="avg"
                                  activeKey={positionsSort.sortKey}
                                  direction={positionsSort.sortDir}
                                  onSort={positionsSort.toggleSort}
                                  align="right"
                                  className="py-3 px-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                                >
                                  Avg
                                </SortableTh>
                                <SortableTh
                                  sortKey="ltp"
                                  activeKey={positionsSort.sortKey}
                                  direction={positionsSort.sortDir}
                                  onSort={positionsSort.toggleSort}
                                  align="right"
                                  className="py-3 px-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                                >
                                  LTP
                                </SortableTh>
                                <SortableTh
                                  sortKey="invested"
                                  activeKey={positionsSort.sortKey}
                                  direction={positionsSort.sortDir}
                                  onSort={positionsSort.toggleSort}
                                  align="right"
                                  className="py-3 px-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                                >
                                  Invested
                                </SortableTh>
                                <SortableTh
                                  sortKey="value"
                                  activeKey={positionsSort.sortKey}
                                  direction={positionsSort.sortDir}
                                  onSort={positionsSort.toggleSort}
                                  align="right"
                                  className="py-3 px-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                                >
                                  Value
                                </SortableTh>
                                <SortableTh
                                  sortKey="pnl"
                                  activeKey={positionsSort.sortKey}
                                  direction={positionsSort.sortDir}
                                  onSort={positionsSort.toggleSort}
                                  align="right"
                                  className="py-3 px-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                                >
                                  P&amp;L
                                </SortableTh>
                                <SortableTh
                                  sortKey="pnlPct"
                                  activeKey={positionsSort.sortKey}
                                  direction={positionsSort.sortDir}
                                  onSort={positionsSort.toggleSort}
                                  align="right"
                                  className="py-3 px-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                                >
                                  P&amp;L %
                                </SortableTh>
                                <SortableTh
                                  sortKey="dayPct"
                                  activeKey={positionsSort.sortKey}
                                  direction={positionsSort.sortDir}
                                  onSort={positionsSort.toggleSort}
                                  align="right"
                                  className="py-3 px-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                                >
                                  Day %
                                </SortableTh>
                                <SortableTh
                                  sortKey="product"
                                  activeKey={positionsSort.sortKey}
                                  direction={positionsSort.sortDir}
                                  onSort={positionsSort.toggleSort}
                                  align="right"
                                  className="py-3 px-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                                >
                                  Product
                                </SortableTh>
                                <th className="py-3 pl-2 pr-5 text-center text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                                  Action
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedPositions.map((pos) => {
                                const mark = pos.ltp > 0 ? pos.ltp : pos.avgPrice;
                                const investedVal = Math.abs(pos.qty) * pos.avgPrice;
                                const currentVal = Math.abs(pos.qty) * mark;
                                const pnlPct =
                                  investedVal > 0 ? (pos.pnl / investedVal) * 100 : 0;
                                const isProfit = pos.pnl >= 0;
                                const symKey = `${pos.symbol.toUpperCase()}:${(
                                  pos.exchange || "NSE"
                                ).toUpperCase()}`;
                                const stratInfo = buyStrategiesBySymbol.get(symKey);
                                return (
                                  <tr
                                    key={`${pos.symbol}-${pos.exchange}-${pos.product}`}
                                    className="border-b border-border/50 hover:bg-bg-hover/50"
                                  >
                                    <td className="py-3 pl-5 pr-2">
                                      <span className="font-medium text-text-primary">
                                        {pos.symbol}
                                      </span>
                                      <span className="ml-1 text-xs text-text-tertiary">
                                        {pos.exchange}
                                      </span>
                                    </td>
                                    <td className="py-3 px-2 max-w-[140px]">
                                      {stratInfo && stratInfo.names.length > 0 ? (
                                        <StrategyBadges
                                          names={stratInfo.names}
                                          unknownCount={stratInfo.unknown}
                                          size="sm"
                                        />
                                      ) : (
                                        <span className="text-xs text-text-tertiary">
                                          —
                                        </span>
                                      )}
                                    </td>
                                    <td
                                      className={cn(
                                        "py-3 px-2 text-right tabular-nums",
                                        pos.qty > 0 ? "text-profit" : "text-loss"
                                      )}
                                    >
                                      {formatNumber(pos.qty)}
                                    </td>
                                    <td className="py-3 px-2 text-right text-text-secondary tabular-nums whitespace-nowrap">
                                      {formatCurrency(pos.avgPrice)}
                                    </td>
                                    <td className="py-3 px-2 text-right text-text-secondary tabular-nums whitespace-nowrap">
                                      {formatCurrency(mark)}
                                    </td>
                                    <td className="py-3 px-2 text-right text-text-secondary tabular-nums whitespace-nowrap">
                                      {formatCurrency(investedVal)}
                                    </td>
                                    <td className="py-3 px-2 text-right text-text-secondary tabular-nums whitespace-nowrap">
                                      {formatCurrency(currentVal)}
                                    </td>
                                    <td
                                      className={cn(
                                        "py-3 px-2 text-right font-medium tabular-nums whitespace-nowrap",
                                        isProfit ? "text-profit" : "text-loss"
                                      )}
                                    >
                                      {isProfit ? "+" : ""}
                                      {formatCurrency(pos.pnl)}
                                    </td>
                                    <td
                                      className={cn(
                                        "py-3 px-2 text-right font-medium tabular-nums",
                                        isProfit ? "text-profit" : "text-loss"
                                      )}
                                    >
                                      {formatPercent(pnlPct)}
                                    </td>
                                    <td className="py-3 px-2 text-right">
                                      <span
                                        className={cn(
                                          "text-xs font-medium",
                                          pos.dayChange >= 0
                                            ? "text-profit"
                                            : "text-loss"
                                        )}
                                      >
                                        {formatPercent(pos.dayChange)}
                                      </span>
                                    </td>
                                    <td className="py-3 px-2 text-right">
                                      <span className="text-xs bg-bg-tertiary px-2 py-0.5 rounded text-text-secondary">
                                        {pos.product}
                                      </span>
                                    </td>
                                    <td className="py-3 pl-2 pr-5">
                                      <div className="flex items-center justify-center">
                                        <button
                                          type="button"
                                          onClick={() => handleExitPosition(pos)}
                                          className="text-xs font-semibold text-orange-400 hover:text-orange-300 bg-orange-900/20 hover:bg-orange-900/40 px-2.5 py-1 rounded transition-colors"
                                        >
                                          Exit
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                          <span className="text-sm text-text-secondary">Net P&L</span>
                          <span className={cn("text-lg font-bold", netPnl >= 0 ? "text-emerald-700" : "text-red-400")}>
                            {formatCurrency(netPnl)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {activeTab === "trades" && (
                  <LiveTradesPanel
                    trades={enrichedLiveTrades}
                    openOrders={orders}
                    cancellingOrderId={isCancellingOrder}
                    onCancelOrder={(order) => {
                      const full =
                        orders.find((o) => o.orderId === order.orderId) ||
                        ({
                          orderId: order.orderId,
                          time: "",
                          symbol: "",
                          type: "MARKET",
                          side: "BUY",
                          qty: 0,
                          price: 0,
                          status: "OPEN",
                        } satisfies KiteOrder);
                      void handleCancelOrder(full);
                    }}
                  />
                )}

                {activeTab === "holdings" && (
                  <div className="card">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                      <h2 className="text-lg font-semibold text-text-primary">
                        Holdings
                        {holdings.length > 0 && (
                          <span className="ml-2 text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">
                            {holdings.length}
                          </span>
                        )}
                      </h2>
                      {holdings.length > 0 && (
                        <div className="rounded-lg border border-border bg-bg-tertiary/50 px-3 py-2 text-xs text-text-secondary space-y-1">
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                            <span>
                              Invested:{" "}
                              <span className="font-semibold text-text-primary tabular-nums">
                                {formatCurrency(holdingsTotals.invested)}
                              </span>
                            </span>
                            <span>
                              Mkt value:{" "}
                              <span className="font-semibold text-text-primary tabular-nums">
                                {formatCurrency(holdingsTotals.currentValue)}
                              </span>
                            </span>
                          </div>
                          <span
                            className={
                              holdingsTotals.pnl >= 0 ? "text-profit" : "text-loss"
                            }
                          >
                            Unrealized: {holdingsTotals.pnl >= 0 ? "+" : ""}
                            {formatCurrency(holdingsTotals.pnl)} (
                            {formatPercent(holdingsPnlPercent)})
                          </span>
                        </div>
                      )}
                    </div>
                    {holdings.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-text-tertiary">
                        <Link2 className="h-10 w-10 mb-3 text-text-tertiary" />
                        <p className="text-sm">No holdings found.</p>
                        <p className="text-xs text-text-tertiary mt-1">
                          {connected
                            ? "You don't have any holdings in this account."
                            : "Connect a Zerodha account to view holdings."}
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto -mx-5">
                        <table className="w-full text-sm min-w-[760px]">
                          <thead>
                            <tr className="border-b border-border">
                              <SortableTh
                                sortKey="symbol"
                                activeKey={holdingsSort.sortKey}
                                direction={holdingsSort.sortDir}
                                onSort={holdingsSort.toggleSort}
                                className="py-3 pl-5 pr-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                              >
                                Symbol
                              </SortableTh>
                              <th className="py-3 px-2 text-left text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                                Strategies
                              </th>
                              <SortableTh
                                sortKey="qty"
                                activeKey={holdingsSort.sortKey}
                                direction={holdingsSort.sortDir}
                                onSort={holdingsSort.toggleSort}
                                align="right"
                                className="py-3 px-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                              >
                                Qty
                              </SortableTh>
                              <SortableTh
                                sortKey="avg"
                                activeKey={holdingsSort.sortKey}
                                direction={holdingsSort.sortDir}
                                onSort={holdingsSort.toggleSort}
                                align="right"
                                className="py-3 px-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                              >
                                Avg
                              </SortableTh>
                              <SortableTh
                                sortKey="ltp"
                                activeKey={holdingsSort.sortKey}
                                direction={holdingsSort.sortDir}
                                onSort={holdingsSort.toggleSort}
                                align="right"
                                className="py-3 px-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                              >
                                LTP
                              </SortableTh>
                              <SortableTh
                                sortKey="invested"
                                activeKey={holdingsSort.sortKey}
                                direction={holdingsSort.sortDir}
                                onSort={holdingsSort.toggleSort}
                                align="right"
                                className="py-3 px-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                              >
                                Invested
                              </SortableTh>
                              <SortableTh
                                sortKey="value"
                                activeKey={holdingsSort.sortKey}
                                direction={holdingsSort.sortDir}
                                onSort={holdingsSort.toggleSort}
                                align="right"
                                className="py-3 px-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                              >
                                Value
                              </SortableTh>
                              <SortableTh
                                sortKey="pnl"
                                activeKey={holdingsSort.sortKey}
                                direction={holdingsSort.sortDir}
                                onSort={holdingsSort.toggleSort}
                                align="right"
                                className="py-3 px-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                              >
                                P&amp;L
                              </SortableTh>
                              <SortableTh
                                sortKey="pnlPct"
                                activeKey={holdingsSort.sortKey}
                                direction={holdingsSort.sortDir}
                                onSort={holdingsSort.toggleSort}
                                align="right"
                                className="py-3 px-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                              >
                                P&amp;L %
                              </SortableTh>
                              <SortableTh
                                sortKey="dayPct"
                                activeKey={holdingsSort.sortKey}
                                direction={holdingsSort.sortDir}
                                onSort={holdingsSort.toggleSort}
                                align="right"
                                className="py-3 px-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                              >
                                Day %
                              </SortableTh>
                              <th className="py-3 pl-2 pr-5 text-center text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                                Action
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedHoldings.map((holding) => {
                              const mark =
                                holding.ltp > 0 ? holding.ltp : holding.avgPrice;
                              const investedVal = holding.qty * holding.avgPrice;
                              const currentVal = holding.qty * mark;
                              const pnl = currentVal - investedVal;
                              const pnlPct =
                                investedVal > 0 ? (pnl / investedVal) * 100 : 0;
                              const isProfit = pnl >= 0;
                              const symKey = `${holding.symbol.toUpperCase()}:${(
                                holding.exchange || "NSE"
                              ).toUpperCase()}`;
                              const stratInfo = buyStrategiesBySymbol.get(symKey);
                              return (
                                <tr
                                  key={`${holding.symbol}-${holding.exchange}`}
                                  className="border-b border-border/50 hover:bg-bg-hover/50"
                                >
                                  <td className="py-3 pl-5 pr-2">
                                    <span className="font-medium text-text-primary">
                                      {holding.symbol}
                                    </span>
                                    <span className="ml-1 text-xs text-text-tertiary">
                                      {holding.exchange}
                                    </span>
                                  </td>
                                  <td className="py-3 px-2 max-w-[140px]">
                                    {stratInfo && stratInfo.names.length > 0 ? (
                                      <StrategyBadges
                                        names={stratInfo.names}
                                        unknownCount={stratInfo.unknown}
                                        size="sm"
                                      />
                                    ) : (
                                      <span className="text-xs text-text-tertiary">
                                        —
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-2 text-right text-text-secondary tabular-nums">
                                    {formatNumber(holding.qty)}
                                  </td>
                                  <td className="py-3 px-2 text-right text-text-secondary tabular-nums whitespace-nowrap">
                                    {formatCurrency(holding.avgPrice)}
                                  </td>
                                  <td className="py-3 px-2 text-right text-text-secondary tabular-nums whitespace-nowrap">
                                    {formatCurrency(mark)}
                                  </td>
                                  <td className="py-3 px-2 text-right text-text-secondary tabular-nums whitespace-nowrap">
                                    {formatCurrency(investedVal)}
                                  </td>
                                  <td className="py-3 px-2 text-right text-text-secondary tabular-nums whitespace-nowrap">
                                    {formatCurrency(currentVal)}
                                  </td>
                                  <td
                                    className={cn(
                                      "py-3 px-2 text-right font-medium tabular-nums whitespace-nowrap",
                                      isProfit ? "text-profit" : "text-loss"
                                    )}
                                  >
                                    {isProfit ? "+" : ""}
                                    {formatCurrency(pnl)}
                                  </td>
                                  <td
                                    className={cn(
                                      "py-3 px-2 text-right font-medium tabular-nums",
                                      isProfit ? "text-profit" : "text-loss"
                                    )}
                                  >
                                    {formatPercent(pnlPct)}
                                  </td>
                                  <td className="py-3 px-2 text-right">
                                    <span
                                      className={cn(
                                        "text-xs font-medium",
                                        holding.dayChange >= 0
                                          ? "text-profit"
                                          : "text-loss"
                                      )}
                                    >
                                      {formatPercent(holding.dayChange)}
                                    </span>
                                  </td>
                                  <td className="py-3 pl-2 pr-5">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleHoldingTrade(holding, "BUY")
                                        }
                                        className="text-xs font-semibold text-accent hover:text-brand bg-accent-muted hover:bg-accent/30 px-2 py-1 rounded transition-colors"
                                      >
                                        Buy more
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleHoldingTrade(holding, "SELL")
                                        }
                                        className="text-xs font-semibold text-orange-400 hover:text-orange-300 bg-orange-900/20 hover:bg-orange-900/40 px-2 py-1 rounded transition-colors"
                                      >
                                        Sell
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
                )}

        {activeTab === "strategies" && (
          <LiveStrategyPerformancePanel
            bundles={strategyDetails}
            onPlaceOrder={() => setOrderPanelOpen(true)}
          />
        )}

        {activeTab === "health" && (
          <LiveHealthPanel
            connected={connected}
            accountId={selectedAccountId || undefined}
            available={selectedFunds?.available ?? 0}
            autoOn={autoTradingEnabled}
            savingAuto={savingKillSwitch}
            onToggleAuto={(next) => void toggleLiveKillSwitch(next)}
          />
        )}
      </div>
    </div>
  );
}

function Plus({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14" /><path d="M12 5v14" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function LiveTradingPage() {
  return (
    <Suspense>
      <LiveTradingContent />
    </Suspense>
  );
}
