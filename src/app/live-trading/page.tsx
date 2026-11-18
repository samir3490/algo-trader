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
import PageHeader from "@/components/ui/page-header";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import Banner from "@/components/ui/banner";
import { useOptionalToast } from "@/components/ui/toast";
import PaginationBar, {
  DEFAULT_PAGE_SIZE,
  paginateItems,
} from "@/components/ui/pagination-bar";
import LiveTabBar, {
  type LiveTradingTab,
} from "@/components/live-trading/live-tab-bar";
import LiveHealthPanel from "@/components/live-trading/live-health-panel";
import LiveAutoSwitch from "@/components/live-trading/live-auto-switch";
import {
  cn,
  formatCurrency,
  formatDateTimeCompactIST,
  formatDateTimeIST,
  formatPercent,
  isMarketOpen,
  getMarketStatus,
  nowISTDateTimeString,
  tableDateTimeThClass,
  tableDateTimeTdClass,
} from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  getSettings,
  saveSettings,
  getZerodhaAccounts,
  getLiveAlgoQuota,
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
import { loadSettingsFromCache, saveSettingsToCache } from "@/lib/settings/cache";

type TransactionType = "BUY" | "SELL";
type ProductType = "MIS" | "CNC" | "NRML";
type OrderType = "MARKET" | "LIMIT" | "SL" | "SL-M";
type Exchange = "NSE" | "BSE";

interface Position {
  symbol: string;
  qty: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
  product: string;
}

interface KiteOrder {
  orderId: string;
  time: string;
  symbol: string;
  type: string;
  side: string;
  qty: number;
  price: number;
  status: string;
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
  const toast = useOptionalToast();
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
  const [pendingKillSwitch, setPendingKillSwitch] = useState<boolean | null>(null);
  const [confirmPlaceOrder, setConfirmPlaceOrder] = useState(false);
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
  const [ordersPage, setOrdersPage] = useState(1);
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
      const msg = next
        ? "Live auto-trading ON — cron may place real orders (also needs ENABLE_LIVE_TRADING)."
        : "Live auto-trading OFF — paper continues; no algo live orders.";
      setStatusMessage(msg);
      toast.success(msg);
    } catch {
      setAutoTradingEnabled(!next);
      const msg = "Could not save live kill switch. Try Settings → Live.";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setSavingKillSwitch(false);
      setPendingKillSwitch(null);
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
      const res = await fetch("/api/zerodha/accounts");
      const data = await res.json();
      const serverAccounts: { kiteUserId: string; userName?: string; email?: string; broker?: string; connected: boolean }[] = data.accounts || [];
      const serverMap = new Map(serverAccounts.map((a) => [a.kiteUserId, a]));

      const merged: ConnectedAccount[] = firestoreAccounts.map((fa) => ({
        ...fa,
        connected: serverMap.has(fa.kiteUserId),
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
            connected: true,
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
            const res = await fetch(`/api/zerodha/margins?accountId=${id}`);
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
  }, []);

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
      const res = await fetch(`/api/zerodha/positions?${apiQuery}`);
      if (!res.ok) return;
      const data = await res.json();
      const mapped: Position[] = (data.positions?.net || []).map((p: any) => ({
        symbol: p.tradingsymbol,
        qty: p.quantity,
        avgPrice: p.average_price,
        ltp: p.last_price,
        pnl: p.pnl,
        product: p.product,
      }));
      setPositions(mapped.filter((p) => p.qty !== 0));
    } catch { /* ignore */ }
  }, [selectedAccountId, apiQuery]);

  const fetchOrders = useCallback(async () => {
    if (!selectedAccountId) return;
    try {
      const res = await fetch(`/api/zerodha/orders?${apiQuery}`);
      if (!res.ok) return;
      const data = await res.json();
      const mapped: KiteOrder[] = (data.orders || []).map((o: any) => ({
        orderId: o.order_id || "",
        time: o.order_timestamp || o.exchange_timestamp || "",
        symbol: o.tradingsymbol,
        type: o.order_type,
        side: o.transaction_type,
        qty: o.quantity,
        price: o.average_price || o.price || 0,
        status: o.status,
      }));
      setOrders(mapped);
    } catch { /* ignore */ }
  }, [selectedAccountId, apiQuery]);

  const fetchHoldings = useCallback(async () => {
    if (!selectedAccountId) return;
    try {
      const res = await fetch(`/api/zerodha/holdings?${apiQuery}`);
      if (!res.ok) return;
      const data = await res.json();
      const mapped: Holding[] = (data.holdings || []).map((h: any) => ({
        symbol: h.tradingsymbol,
        exchange: h.exchange || "NSE",
        qty: h.quantity ?? 0,
        avgPrice: h.average_price ?? 0,
        ltp: h.last_price ?? 0,
        pnl: h.pnl ?? 0,
        invested: h.invested ?? (h.quantity ?? 0) * (h.average_price ?? 0),
        currentValue: h.currentValue ?? (h.quantity ?? 0) * (h.last_price ?? 0),
        pnlPercent: h.pnlPercent ?? 0,
        dayChange: h.day_change_percentage || 0,
      }));
      setHoldings(mapped);
    } catch { /* ignore */ }
  }, [selectedAccountId, apiQuery]);

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
  const holdingsTotals = holdings.reduce(
    (acc, h) => ({
      invested: acc.invested + h.invested,
      currentValue: acc.currentValue + h.currentValue,
      pnl: acc.pnl + h.pnl,
    }),
    { invested: 0, currentValue: 0, pnl: 0 }
  );
  const holdingsPnlPercent =
    holdingsTotals.invested > 0 ? (holdingsTotals.pnl / holdingsTotals.invested) * 100 : 0;

  /** Aggregate live orders by symbol for Strategies Performance tab. */
  const strategyPerfRows = useMemo(() => {
    const map = new Map<
      string,
      { symbol: string; buys: number; sells: number; buyQty: number; sellQty: number; complete: number }
    >();
    for (const o of orders) {
      const key = (o.symbol || "").toUpperCase();
      if (!key) continue;
      const row = map.get(key) || {
        symbol: key,
        buys: 0,
        sells: 0,
        buyQty: 0,
        sellQty: 0,
        complete: 0,
      };
      const side = (o.side || "").toUpperCase();
      if (side === "BUY") {
        row.buys += 1;
        row.buyQty += o.qty || 0;
      } else if (side === "SELL") {
        row.sells += 1;
        row.sellQty += o.qty || 0;
      }
      if ((o.status || "").toUpperCase() === "COMPLETE") row.complete += 1;
      map.set(key, row);
    }
    return [...map.values()].sort(
      (a, b) => b.buys + b.sells - (a.buys + a.sells)
    );
  }, [orders]);

  const positionsSort = useTableSort({ key: "pnl", dir: "desc" });
  const sortedPositions = useMemo(
    () =>
      positionsSort.sortRows(positions, {
        symbol: (p) => p.symbol,
        qty: (p) => p.qty,
        avg: (p) => p.avgPrice,
        ltp: (p) => p.ltp,
        pnl: (p) => p.pnl,
        product: (p) => p.product,
      }),
    [positions, positionsSort.sortRows]
  );

  const ordersSort = useTableSort({ key: "when", dir: "desc" });
  const sortedOrders = useMemo(
    () =>
      ordersSort.sortRows(orders, {
        when: (o) => new Date(o.time).getTime(),
        symbol: (o) => o.symbol,
        type: (o) => o.type,
        side: (o) => o.side,
        qty: (o) => o.qty,
        price: (o) => o.price,
        status: (o) => o.status,
      }),
    [orders, ordersSort.sortRows]
  );

  useEffect(() => {
    setOrdersPage(1);
  }, [orders.length, ordersSort.sortKey, ordersSort.sortDir]);

  const ordersPagination = useMemo(
    () => paginateItems(sortedOrders, ordersPage, DEFAULT_PAGE_SIZE),
    [sortedOrders, ordersPage]
  );
  const pagedOrders = ordersPagination.pageItems;

  const holdingsSort = useTableSort({ key: "pnl", dir: "desc" });
  const sortedHoldings = useMemo(
    () =>
      holdingsSort.sortRows(holdings, {
        symbol: (h) => h.symbol,
        qty: (h) => h.qty,
        avg: (h) => h.avgPrice,
        ltp: (h) => h.ltp,
        invested: (h) => h.invested,
        value: (h) => h.currentValue,
        pnl: (h) => h.pnl,
        pnlPct: (h) => h.pnlPercent,
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
        const msg = data.error || "Failed to place order. Please try again.";
        setErrorMessage(msg);
        toast.error(msg);
        return;
      }

      const accountLabel = selectedAccount?.label || selectedAccount?.userName || selectedAccountId;
      const okMsg = `Order placed on ${accountLabel}! Order ID: ${data.orderId}`;
      setStatusMessage(okMsg);
      toast.success(okMsg);
      setSymbol("");
      setQuantity("");
      setPrice("");
      setTriggerPrice("");
      setSearchInput("");
      setOrderPanelOpen(false);
      setConfirmPlaceOrder(false);

      setTimeout(() => {
        fetchOrders();
        fetchPositions();
        fetchHoldings();
      }, 2000);
    } catch (err: any) {
      const msg = err.message || "Network error. Please check your connection.";
      setErrorMessage(msg);
      toast.error(msg);
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
      <PageHeader
        title="Live Trading"
        subtitle="Place real orders and monitor positions — separate capital from paper"
        mode="live"
        actions={
          <>
            <Link
              href="/settings?tab=live-rules"
              className="rounded-lg border border-mode-live-border bg-white px-3 py-1.5 text-xs font-semibold text-mode-live-fg hover:bg-mode-live-soft"
            >
              Live Rules
            </Link>
            <Link
              href="/settings?tab=live"
              className="rounded-lg border border-mode-live-border bg-white px-3 py-1.5 text-xs font-semibold text-mode-live-fg hover:bg-mode-live-soft"
            >
              Live Settings
            </Link>
            <LiveAutoSwitch
              enabled={autoTradingEnabled}
              saving={savingKillSwitch}
              onToggle={(next) => setPendingKillSwitch(next)}
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
              className="inline-flex items-center gap-1.5 rounded-lg bg-mode-live px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-mode-live-hover shrink-0"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              <span className="sm:hidden">Order</span>
              <span className="hidden sm:inline">Place Order</span>
            </button>
          </>
        }
      >
        <div className="mb-4 rounded-lg border border-mode-live-border bg-white/80 px-4 py-3 text-xs text-mode-live-fg">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Available cash"
            primary={formatCurrency(selectedFunds?.available ?? 0)}
            hint={connected ? selectedAccountId || "Zerodha" : "Connect account"}
            icon={IndianRupee}
            colorClass="text-text-primary"
            mode="live"
            className="bg-white"
          />
          <StatCard
            label="Margin used"
            primary={formatCurrency(selectedFunds?.used ?? 0)}
            hint={`Net ${formatCurrency(selectedFunds?.net ?? 0)}`}
            icon={Wallet}
            colorClass="text-text-primary"
            mode="live"
            className="bg-white"
          />
          <StatCard
            label="Day P&L (positions)"
            primary={formatCurrency(netPnl)}
            hint={`${positions.length} open position${positions.length === 1 ? "" : "s"}`}
            icon={netPnl >= 0 ? TrendingUp : TrendingDown}
            colorClass={netPnl >= 0 ? "text-profit" : "text-loss"}
            mode="live"
            className="bg-white"
          />
          <StatCard
            label="Holdings P&L"
            primary={formatCurrency(holdingsTotals.pnl)}
            secondary={formatPercent(holdingsPnlPercent)}
            hint={`Invested ${formatCurrency(holdingsTotals.invested)}`}
            icon={Wallet}
            colorClass={
              holdingsTotals.pnl >= 0 ? "text-profit" : "text-loss"
            }
            mode="live"
            className="bg-white"
          />
        </div>
      </PageHeader>

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

      {(errorMessage || statusMessage) && (
        <div className="px-3 sm:px-6 py-3 space-y-2 border-b border-border bg-bg-primary">
          {errorMessage && (
            <Banner tone="danger" onDismiss={() => setErrorMessage("")}>
              {errorMessage}
            </Banner>
          )}
          {statusMessage && (
            <Banner tone="success" onDismiss={() => setStatusMessage("")}>
              {statusMessage}
            </Banner>
          )}
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
            trades: orders.length,
            strategies: strategyPerfRows.length,
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

                {/* Place Order — confirm before real money */}
                <button
                  onClick={() => setConfirmPlaceOrder(true)}
                  disabled={isPlacingOrder || !symbol.trim() || !quantity || !connected}
                  className={cn(
                    "w-full min-h-12 py-3 rounded-lg font-semibold text-sm transition-colors mt-2 flex items-center justify-center gap-2 text-white touch-manipulation",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    transactionType === "BUY"
                      ? "bg-mode-live hover:bg-mode-live-hover"
                      : "bg-loss hover:bg-loss/90"
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
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-text-secondary text-xs border-b border-border">
                                <SortableTh sortKey="symbol" activeKey={positionsSort.sortKey} direction={positionsSort.sortDir} onSort={positionsSort.toggleSort} className="py-2 px-3 font-medium">Symbol</SortableTh>
                                <SortableTh sortKey="qty" activeKey={positionsSort.sortKey} direction={positionsSort.sortDir} onSort={positionsSort.toggleSort} align="right" className="py-2 px-3 font-medium">Qty</SortableTh>
                                <SortableTh sortKey="avg" activeKey={positionsSort.sortKey} direction={positionsSort.sortDir} onSort={positionsSort.toggleSort} align="right" className="py-2 px-3 font-medium">Avg Price</SortableTh>
                                <SortableTh sortKey="ltp" activeKey={positionsSort.sortKey} direction={positionsSort.sortDir} onSort={positionsSort.toggleSort} align="right" className="py-2 px-3 font-medium">LTP</SortableTh>
                                <SortableTh sortKey="pnl" activeKey={positionsSort.sortKey} direction={positionsSort.sortDir} onSort={positionsSort.toggleSort} align="right" className="py-2 px-3 font-medium">P&amp;L</SortableTh>
                                <SortableTh sortKey="product" activeKey={positionsSort.sortKey} direction={positionsSort.sortDir} onSort={positionsSort.toggleSort} align="right" className="py-2 px-3 font-medium">Product</SortableTh>
                                <th className="text-right py-2 px-3 font-medium"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedPositions.map((pos, i) => (
                                <tr key={i} className="border-b border-border/50 hover:bg-bg-tertiary/30">
                                  <td className="py-2.5 px-3 font-medium">{pos.symbol}</td>
                                  <td className={cn("text-right py-2.5 px-3", pos.qty > 0 ? "text-emerald-700" : "text-red-400")}>
                                    {pos.qty}
                                  </td>
                                  <td className="text-right py-2.5 px-3 text-text-secondary">{formatCurrency(pos.avgPrice)}</td>
                                  <td className="text-right py-2.5 px-3 text-text-secondary">{formatCurrency(pos.ltp)}</td>
                                  <td className={cn("text-right py-2.5 px-3 font-medium", pos.pnl >= 0 ? "text-emerald-700" : "text-red-400")}>
                                    {formatCurrency(pos.pnl)}
                                  </td>
                                  <td className="text-right py-2.5 px-3">
                                    <span className="text-xs bg-bg-tertiary px-2 py-0.5 rounded text-text-secondary">{pos.product}</span>
                                  </td>
                                  <td className="text-right py-2.5 px-3">
                                    <button
                                      onClick={() => handleExitPosition(pos)}
                                      className="text-xs font-semibold text-orange-400 hover:text-orange-300 bg-orange-900/20 hover:bg-orange-900/40 px-2.5 py-1 rounded transition-colors"
                                    >
                                      Exit
                                    </button>
                                  </td>
                                </tr>
                              ))}
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

                {/* Trades Tab (Zerodha orders) */}
                {activeTab === "trades" && (
                  <div className="card">
                    {orders.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-text-tertiary">
                        <Clock className="h-10 w-10 mb-3 text-text-tertiary" />
                        <p className="text-sm">No orders placed today.</p>
                      </div>
                    ) : (
                      <div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-text-secondary text-xs border-b border-border">
                              <SortableTh sortKey="when" activeKey={ordersSort.sortKey} direction={ordersSort.sortDir} onSort={ordersSort.toggleSort} className={cn(tableDateTimeThClass, "py-2 px-3 font-medium")}>When</SortableTh>
                              <SortableTh sortKey="symbol" activeKey={ordersSort.sortKey} direction={ordersSort.sortDir} onSort={ordersSort.toggleSort} className="py-2 px-3 font-medium">Symbol</SortableTh>
                              <SortableTh sortKey="type" activeKey={ordersSort.sortKey} direction={ordersSort.sortDir} onSort={ordersSort.toggleSort} className="py-2 px-3 font-medium">Type</SortableTh>
                              <SortableTh sortKey="side" activeKey={ordersSort.sortKey} direction={ordersSort.sortDir} onSort={ordersSort.toggleSort} className="py-2 px-3 font-medium">Side</SortableTh>
                              <SortableTh sortKey="qty" activeKey={ordersSort.sortKey} direction={ordersSort.sortDir} onSort={ordersSort.toggleSort} align="right" className="py-2 px-3 font-medium">Qty</SortableTh>
                              <SortableTh sortKey="price" activeKey={ordersSort.sortKey} direction={ordersSort.sortDir} onSort={ordersSort.toggleSort} align="right" className="py-2 px-3 font-medium">Price</SortableTh>
                              <SortableTh sortKey="status" activeKey={ordersSort.sortKey} direction={ordersSort.sortDir} onSort={ordersSort.toggleSort} align="right" className="py-2 px-3 font-medium">Status</SortableTh>
                              <th className="text-right py-2 px-3 font-medium"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagedOrders.map((order, i) => (
                              <tr key={`${order.orderId || order.time}-${i}`} className="border-b border-border/50 hover:bg-bg-tertiary/30">
                                <td
                                  className={cn(tableDateTimeTdClass, "py-2.5 px-3")}
                                  title={formatDateTimeIST(order.time)}
                                >
                                  {formatDateTimeCompactIST(order.time)}
                                </td>
                                <td className="py-2.5 px-3 font-medium">{order.symbol}</td>
                                <td className="py-2.5 px-3 text-text-secondary text-xs">{order.type}</td>
                                <td className="py-2.5 px-3">
                                  <span className={cn("text-xs font-semibold", order.side === "BUY" ? "text-emerald-700" : "text-red-400")}>
                                    {order.side}
                                  </span>
                                </td>
                                <td className="text-right py-2.5 px-3 text-text-secondary">{order.qty}</td>
                                <td className="text-right py-2.5 px-3 text-text-secondary">{formatCurrency(order.price)}</td>
                                <td className="text-right py-2.5 px-3">
                                  <span
                                    className={cn(
                                      "text-xs px-2 py-0.5 rounded-full font-medium",
                                      order.status === "COMPLETE" && "bg-emerald-100 text-emerald-800",
                                      order.status === "PENDING" && "bg-yellow-900/50 text-yellow-400",
                                      order.status === "REJECTED" && "bg-red-900/50 text-red-400",
                                      order.status === "CANCELLED" && "bg-bg-tertiary text-text-secondary",
                                      order.status === "OPEN" && "bg-accent-muted text-accent"
                                    )}
                                  >
                                    {order.status}
                                  </span>
                                </td>
                                <td className="text-right py-2.5 px-3">
                                  {(order.status === "PENDING" || order.status === "OPEN") && (
                                    <button
                                      onClick={() => handleCancelOrder(order)}
                                      disabled={isCancellingOrder === order.orderId}
                                      className="flex items-center gap-1 text-xs font-semibold text-red-400 hover:text-red-300 bg-red-900/20 hover:bg-red-900/40 px-2 py-1 rounded transition-colors disabled:opacity-50"
                                    >
                                      {isCancellingOrder === order.orderId ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <XCircle className="h-3 w-3" />
                                      )}
                                      Cancel
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <PaginationBar
                        page={ordersPagination.safePage}
                        totalPages={ordersPagination.totalPages}
                        totalItems={sortedOrders.length}
                        onPageChange={setOrdersPage}
                      />
                      </div>
                    )}
                  </div>
                )}

                {/* Holdings Tab */}
                {activeTab === "holdings" && (
                  <div className="card">
                    {holdings.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-text-tertiary">
                        <Link2 className="h-10 w-10 mb-3 text-text-tertiary" />
                        <p className="text-sm">No holdings found.</p>
                        <p className="text-xs text-text-tertiary mt-1">
                          {connected ? "You don't have any holdings in this account." : "Connect a Zerodha account to view holdings."}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm min-w-[720px]">
                            <thead>
                              <tr className="text-text-secondary text-xs border-b border-border">
                                <SortableTh sortKey="symbol" activeKey={holdingsSort.sortKey} direction={holdingsSort.sortDir} onSort={holdingsSort.toggleSort} className="py-2 px-3 font-medium">Symbol</SortableTh>
                                <SortableTh sortKey="qty" activeKey={holdingsSort.sortKey} direction={holdingsSort.sortDir} onSort={holdingsSort.toggleSort} align="right" className="py-2 px-3 font-medium">Qty</SortableTh>
                                <SortableTh sortKey="avg" activeKey={holdingsSort.sortKey} direction={holdingsSort.sortDir} onSort={holdingsSort.toggleSort} align="right" className="py-2 px-3 font-medium">Avg Price</SortableTh>
                                <SortableTh sortKey="ltp" activeKey={holdingsSort.sortKey} direction={holdingsSort.sortDir} onSort={holdingsSort.toggleSort} align="right" className="py-2 px-3 font-medium">LTP</SortableTh>
                                <SortableTh sortKey="invested" activeKey={holdingsSort.sortKey} direction={holdingsSort.sortDir} onSort={holdingsSort.toggleSort} align="right" className="py-2 px-3 font-medium">Invested</SortableTh>
                                <SortableTh sortKey="value" activeKey={holdingsSort.sortKey} direction={holdingsSort.sortDir} onSort={holdingsSort.toggleSort} align="right" className="py-2 px-3 font-medium">Current Value</SortableTh>
                                <SortableTh sortKey="pnl" activeKey={holdingsSort.sortKey} direction={holdingsSort.sortDir} onSort={holdingsSort.toggleSort} align="right" className="py-2 px-3 font-medium">P&amp;L</SortableTh>
                                <SortableTh sortKey="pnlPct" activeKey={holdingsSort.sortKey} direction={holdingsSort.sortDir} onSort={holdingsSort.toggleSort} align="right" className="py-2 px-3 font-medium">P&amp;L %</SortableTh>
                                <SortableTh sortKey="dayPct" activeKey={holdingsSort.sortKey} direction={holdingsSort.sortDir} onSort={holdingsSort.toggleSort} align="right" className="py-2 px-3 font-medium">Day %</SortableTh>
                                <th className="text-right py-2 px-3 font-medium">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sortedHoldings.map((holding, i) => (
                                <tr key={i} className="border-b border-border/50 hover:bg-bg-tertiary/30">
                                  <td className="py-2.5 px-3 font-medium">
                                    {holding.symbol}
                                    <span className="text-xs text-text-tertiary ml-1">{holding.exchange}</span>
                                  </td>
                                  <td className="text-right py-2.5 px-3 text-text-secondary">{holding.qty}</td>
                                  <td className="text-right py-2.5 px-3 text-text-secondary">{formatCurrency(holding.avgPrice)}</td>
                                  <td className="text-right py-2.5 px-3 text-text-secondary">{formatCurrency(holding.ltp)}</td>
                                  <td className="text-right py-2.5 px-3 text-text-secondary">{formatCurrency(holding.invested)}</td>
                                  <td className="text-right py-2.5 px-3 text-text-secondary">{formatCurrency(holding.currentValue)}</td>
                                  <td className={cn("text-right py-2.5 px-3 font-medium", holding.pnl >= 0 ? "text-emerald-700" : "text-red-400")}>
                                    {holding.pnl >= 0 ? "+" : ""}{formatCurrency(holding.pnl)}
                                  </td>
                                  <td className={cn("text-right py-2.5 px-3 font-medium", holding.pnlPercent >= 0 ? "text-emerald-700" : "text-red-400")}>
                                    {formatPercent(holding.pnlPercent)}
                                  </td>
                                  <td className="text-right py-2.5 px-3">
                                    <span className={cn("text-xs font-medium", holding.dayChange >= 0 ? "text-emerald-700" : "text-red-400")}>
                                      {formatPercent(holding.dayChange)}
                                    </span>
                                  </td>
                                  <td className="text-right py-2.5 px-3">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleHoldingTrade(holding, "BUY")}
                                        className="text-xs font-semibold text-accent hover:text-brand bg-accent-muted hover:bg-accent/30 px-2 py-1 rounded transition-colors"
                                      >
                                        Buy more
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleHoldingTrade(holding, "SELL")}
                                        className="text-xs font-semibold text-orange-400 hover:text-orange-300 bg-orange-900/20 hover:bg-orange-900/40 px-2 py-1 rounded transition-colors"
                                      >
                                        Sell
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-4 pt-3 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-text-tertiary">Total Invested</p>
                            <p className="font-semibold text-text-primary">{formatCurrency(holdingsTotals.invested)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-text-tertiary">Current Value</p>
                            <p className="font-semibold text-text-primary">{formatCurrency(holdingsTotals.currentValue)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-text-tertiary">Total P&L</p>
                            <p className={cn("font-semibold", holdingsTotals.pnl >= 0 ? "text-emerald-700" : "text-red-400")}>
                              {holdingsTotals.pnl >= 0 ? "+" : ""}{formatCurrency(holdingsTotals.pnl)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-text-tertiary">Overall P&L %</p>
                            <p className={cn("font-semibold", holdingsPnlPercent >= 0 ? "text-emerald-700" : "text-red-400")}>
                              {formatPercent(holdingsPnlPercent)}
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

        {activeTab === "strategies" && (
          <div className="card">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  Strategies Performance
                </h2>
                <p className="text-xs text-text-secondary mt-0.5">
                  Live book by symbol from today&apos;s Zerodha orders (algo + manual)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOrderPanelOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Place Order
              </button>
            </div>
            {strategyPerfRows.length === 0 ? (
              <div className="py-12 text-center text-text-tertiary text-sm">
                No live orders yet today. Place an order or wait for algo fills.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-text-secondary text-xs border-b border-border">
                      <th className="text-left py-2 px-3 font-medium">Symbol</th>
                      <th className="text-right py-2 px-3 font-medium">Buys</th>
                      <th className="text-right py-2 px-3 font-medium">Buy qty</th>
                      <th className="text-right py-2 px-3 font-medium">Sells</th>
                      <th className="text-right py-2 px-3 font-medium">Sell qty</th>
                      <th className="text-right py-2 px-3 font-medium">Complete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {strategyPerfRows.map((row) => (
                      <tr
                        key={row.symbol}
                        className="border-b border-border/50 hover:bg-bg-tertiary/30"
                      >
                        <td className="py-2.5 px-3 font-medium text-text-primary">
                          {row.symbol}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-emerald-700">
                          {row.buys}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          {row.buyQty}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-red-700">
                          {row.sells}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">
                          {row.sellQty}
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-text-secondary">
                          {row.complete}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "health" && (
          <LiveHealthPanel
            connected={connected}
            accountId={selectedAccountId || undefined}
            available={selectedFunds?.available ?? 0}
            autoOn={autoTradingEnabled}
            savingAuto={savingKillSwitch}
            onToggleAuto={(next) => setPendingKillSwitch(next)}
          />
        )}
      </div>

      <ConfirmDialog
        open={pendingKillSwitch !== null}
        onClose={() => setPendingKillSwitch(null)}
        onConfirm={() => {
          if (pendingKillSwitch !== null) void toggleLiveKillSwitch(pendingKillSwitch);
        }}
        title={
          pendingKillSwitch
            ? "Turn live auto-trading ON?"
            : "Turn live auto-trading OFF?"
        }
        description={
          pendingKillSwitch
            ? "Cron may place real Zerodha orders when market is open (also needs ENABLE_LIVE_TRADING). Paper trading is unchanged."
            : "Stops algo live orders immediately. Paper trading continues."
        }
        confirmLabel={pendingKillSwitch ? "Enable live auto" : "Disable live auto"}
        tone={pendingKillSwitch ? "live" : "danger"}
        loading={savingKillSwitch}
      />

      <ConfirmDialog
        open={confirmPlaceOrder}
        onClose={() => setConfirmPlaceOrder(false)}
        onConfirm={() => void handlePlaceOrder()}
        title={`Confirm live ${transactionType}`}
        description="This sends a real order to Zerodha with real money."
        confirmLabel={`Confirm ${transactionType}`}
        tone={transactionType === "SELL" ? "danger" : "live"}
        loading={isPlacingOrder}
      >
        <div className="rounded-lg border border-mode-live-border bg-mode-live-muted/50 px-3 py-3 text-sm space-y-1.5">
          <p>
            <span className="text-text-tertiary">Symbol </span>
            <span className="font-semibold text-text-primary">
              {symbol.toUpperCase()} · {exchange}
            </span>
          </p>
          <p>
            <span className="text-text-tertiary">Qty </span>
            <span className="font-semibold tabular-nums">{quantity}</span>
            <span className="text-text-tertiary"> · </span>
            <span className="font-semibold">{orderType}</span>
            <span className="text-text-tertiary"> · </span>
            <span className="font-semibold">{productType}</span>
          </p>
          <p className="text-xs text-text-secondary">
            Account: {selectedAccount?.label || selectedAccount?.userName || selectedAccountId || "—"}
          </p>
        </div>
      </ConfirmDialog>
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
