"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Inbox,
  Link2,
  Loader2,
  LogOut,
  Power,
  Search,
  ShieldAlert,
  XCircle,
  Zap,
  ChevronDown,
  Users,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { cn, formatCurrency, formatPercent, isMarketOpen, getMarketStatus } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { getZerodhaAccounts, type ZerodhaAccount } from "@/lib/firebase";
import { fetchMarketQuote, fetchZerodhaQuoteDepth } from "@/lib/market-data/fetch-quote-client";

type TransactionType = "BUY" | "SELL";
type ProductType = "MIS" | "CNC" | "NRML";
type OrderType = "MARKET" | "LIMIT" | "SL" | "SL-M";
type Exchange = "NSE" | "BSE";
type TabType = "positions" | "orders" | "holdings";

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

const strategies = [
  "SMA Crossover",
  "EMA Crossover",
  "RSI Strategy",
  "MACD Crossover",
  "Bollinger Bands",
];

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

  const [activeTab, setActiveTab] = useState<TabType>("positions");

  const [autoTradingEnabled, setAutoTradingEnabled] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState(strategies[0]);
  const [tradingSymbols, setTradingSymbols] = useState("");
  const [maxOrdersPerDay, setMaxOrdersPerDay] = useState("20");
  const [maxLossLimit, setMaxLossLimit] = useState("5000");

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
      const now = new Date();
      const ist = now.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
      setCurrentTime(ist);
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
  }, [user]);

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

  const handlePlaceOrder = async () => {
    if (!symbol.trim() || !quantity) return;

    if (!connected) {
      setErrorMessage("Please connect to Zerodha first before placing live orders.");
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
        quantity: parseInt(quantity),
        product: productType,
        accountId: selectedAccountId,
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
      setSymbol("");
      setQuantity("");
      setPrice("");
      setTriggerPrice("");
      setSearchInput("");

      setTimeout(() => {
        fetchOrders();
        fetchPositions();
      }, 2000);
    } catch (err: any) {
      setErrorMessage(err.message || "Network error. Please check your connection.");
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const handleExitPosition = (pos: Position) => {
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
    <div className="min-h-screen bg-[#0a0f1a] text-white">
      {/* Account Selector Banner */}
      <div className="bg-[#111827] border-b border-gray-800 px-3 sm:px-6 py-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Users className="h-4 w-4 text-gray-400 hidden sm:block" />
              <span className="text-xs sm:text-sm text-gray-400">Account:</span>
            </div>

            {loadingAccounts ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading accounts...
              </div>
            ) : connectedAccounts.length === 0 ? (
              <a
                href="/api/zerodha/login"
                className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm rounded transition-colors"
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
                      ? "border-emerald-700 bg-emerald-900/30 text-emerald-300 hover:bg-emerald-900/50"
                      : "border-amber-700 bg-amber-900/30 text-amber-300 hover:bg-amber-900/50"
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", connected ? "bg-emerald-400" : "bg-amber-400")} />
                  <span>
                    {selectedAccount?.label || selectedAccount?.userName || selectedAccountId || "Select Account"}
                  </span>
                  <span className="text-xs opacity-60">({selectedAccountId})</span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </button>

                {showAccountDropdown && (
                  <div className="absolute z-50 top-full left-0 mt-1 w-72 bg-[#1a2035] border border-gray-700 rounded-lg shadow-2xl overflow-hidden">
                    <div className="p-2 border-b border-gray-700/50">
                      <p className="text-xs text-gray-500 px-2 py-1">
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
                              ? "bg-blue-600/20"
                              : "hover:bg-gray-800/50",
                            !account.connected && "opacity-50 cursor-not-allowed"
                          )}
                        >
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full shrink-0",
                              account.connected ? "bg-emerald-400" : "bg-gray-600"
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-200 truncate">
                              {account.label || account.userName || account.kiteUserId}
                            </p>
                            <p className="text-xs text-gray-500">
                              {account.kiteUserId}
                              {!account.connected && " · Session expired"}
                            </p>
                            {account.connected && accountFunds[account.kiteUserId] && (
                              <p className="text-xs text-emerald-400/90 mt-0.5">
                                Available {formatCurrency(accountFunds[account.kiteUserId].available)}
                              </p>
                            )}
                          </div>
                          {account.kiteUserId === selectedAccountId && (
                            <CheckCircle2 className="h-4 w-4 text-blue-400 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="p-2 border-t border-gray-700/50">
                      <a
                        href="/api/zerodha/login"
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-blue-400 hover:bg-blue-600/10 rounded transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Another Account
                      </a>
                      <a
                        href="/settings"
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-400 hover:bg-gray-800/50 rounded transition-colors"
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
              <div className="flex items-center gap-1.5 rounded-md bg-emerald-900/20 border border-emerald-800/40 px-3 py-1.5">
                <Wallet className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-xs text-gray-400">Available</span>
                <span className="text-sm font-semibold text-emerald-300">
                  {loadingFunds && !selectedFunds
                    ? "..."
                    : formatCurrency(selectedFunds?.available ?? 0)}
                </span>
              </div>
              {selectedFunds && selectedFunds.used > 0 && (
                <span className="text-xs text-gray-500">
                  Used {formatCurrency(selectedFunds.used)}
                </span>
              )}
              {connectedAccounts.length > 1 && (
                <span className="text-xs text-gray-500">
                  {connectedAccounts.length} accounts active
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Market Status Bar */}
      <div className="bg-[#111827] border-b border-gray-800 px-3 sm:px-6 py-2.5 flex items-center justify-between">
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
            <span className={cn("text-sm font-medium", marketOpen ? "text-green-400" : "text-red-400")}>
              NSE: {marketStatus}
            </span>
          </div>
          <span className="text-gray-500 text-xs hidden sm:inline">|</span>
          <span className="text-gray-400 text-xs hidden sm:inline">Trading Hours: 9:15 AM - 3:30 PM IST</span>
        </div>
        <div className="flex items-center gap-2 text-gray-400 text-sm">
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
        <div className="bg-emerald-900/40 border-b border-emerald-700/50 px-3 sm:px-6 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <span className="text-emerald-200 text-sm font-medium">{statusMessage}</span>
          </div>
          <button onClick={() => setStatusMessage("")} className="text-emerald-400 hover:text-emerald-300 text-sm">
            Dismiss
          </button>
        </div>
      )}

      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* No Account Warning */}
        {!isCheckingAuth && connectedAccounts.length === 0 && (
          <div className="bg-amber-900/40 border border-amber-700/50 rounded-lg px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              <span className="text-amber-200 text-sm font-medium">
                No Zerodha accounts connected. Connect an account to start live trading.
              </span>
            </div>
            <a
              href="/api/zerodha/login"
              className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm rounded transition-colors"
            >
              Connect to Zerodha
            </a>
          </div>
        )}

        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Left Column - Order Placement */}
          <div className="lg:col-span-1" ref={orderFormRef}>
            <div className="bg-[#111827] border border-gray-800 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-5">
                <Zap className="h-5 w-5 text-yellow-400" />
                <h2 className="text-lg font-semibold">Place Order</h2>
                {selectedAccount && (
                  <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded ml-auto">
                    {selectedAccount.label || selectedAccount.userName || selectedAccountId}
                  </span>
                )}
              </div>

              {/* Warning */}
              <div className="bg-red-900/30 border border-red-800/50 rounded-md p-3 mb-5 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                <p className="text-red-300 text-xs leading-relaxed">
                  This will place REAL orders on Zerodha. Use with caution.
                </p>
              </div>

              <div className="space-y-4">
                {/* Symbol search */}
                <div className="relative">
                  <label className="text-xs text-gray-400 mb-1 block">Symbol</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
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
                      className="w-full bg-[#0a0f1a] border border-gray-700 rounded-md py-2 pl-9 pr-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                    {(isLoadingQuote || isSearchingInstruments) && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-400 animate-spin" />
                    )}
                  </div>
                  {showSuggestions && filteredStocks.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-[#1a2035] border border-gray-700 rounded-md shadow-xl max-h-48 overflow-y-auto">
                      {filteredStocks.map((s) => (
                        <button
                          key={s.symbol}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleSelectSymbol(s.symbol)}
                          className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-blue-600/20 hover:text-white transition-colors flex items-center justify-between"
                        >
                          <span className="font-medium">{s.symbol}</span>
                          <span className="text-xs text-gray-500 ml-2 truncate">{s.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected symbol price (quick view) */}
                {symbol.trim() && (
                  <div className="rounded-md border border-gray-700 bg-[#0a0f1a] px-3 py-2 space-y-1">
                    <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">{symbol} · {exchange}</span>
                    {isLoadingQuote ? (
                      <span className="text-xs text-gray-500 flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Loading price...
                      </span>
                    ) : quote ? (
                      <div className="text-right">
                        <span className={cn("text-sm font-bold", quote.changePercent >= 0 ? "text-green-400" : "text-red-400")}>
                          {formatCurrency(quote.lastPrice)}
                        </span>
                        <span className={cn("text-xs ml-2", quote.changePercent >= 0 ? "text-green-400/80" : "text-red-400/80")}>
                          {quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)} ({formatPercent(quote.changePercent)})
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">Price unavailable</span>
                    )}
                    </div>
                    {quote?.priceNote && (
                      <p className="text-[10px] text-gray-500">{quote.priceNote}</p>
                    )}
                  </div>
                )}

                {/* Quote Panel */}
                {quote && (
                  <div className="bg-[#0a0f1a] border border-gray-700 rounded-md p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{quote.symbol}</span>
                      <span className={cn("text-lg font-bold", quote.changePercent >= 0 ? "text-green-400" : "text-red-400")}>
                        {formatCurrency(quote.lastPrice)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded", quote.changePercent >= 0 ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400")}>
                        {quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)} ({formatPercent(quote.changePercent)})
                      </span>
                      {quote.priceNote && (
                        <span className="text-[10px] text-gray-500">{quote.priceNote}</span>
                      )}
                      {quoteLastUpdated && (
                        <span className="text-[10px] text-gray-500">
                          Updated {quoteLastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div><span className="text-gray-500">Open</span><p className="text-gray-300">{formatCurrency(quote.open)}</p></div>
                      <div><span className="text-gray-500">High</span><p className="text-green-400">{formatCurrency(quote.high)}</p></div>
                      <div><span className="text-gray-500">Low</span><p className="text-red-400">{formatCurrency(quote.low)}</p></div>
                      <div><span className="text-gray-500">Close</span><p className="text-gray-300">{formatCurrency(quote.close)}</p></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-gray-500">Volume</span><p className="text-gray-300">{(quote.volume || 0).toLocaleString("en-IN")}</p></div>
                      <div><span className="text-gray-500">Circuit</span><p className="text-gray-300">{formatCurrency(quote.lowerCircuit)} - {formatCurrency(quote.upperCircuit)}</p></div>
                    </div>

                    {(quote.buyDepth.length > 0 || quote.sellDepth.length > 0) && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1.5 font-medium">Market Depth</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <div className="grid grid-cols-3 text-gray-500 mb-1">
                              <span>Bid</span><span className="text-right">Qty</span><span className="text-right">Ord</span>
                            </div>
                            {quote.buyDepth.map((b, i) => (
                              <div key={i} className="grid grid-cols-3 text-green-400/80 py-0.5">
                                <span>{b.price.toFixed(2)}</span>
                                <span className="text-right">{b.quantity}</span>
                                <span className="text-right">{b.orders}</span>
                              </div>
                            ))}
                            <div className="mt-1 text-gray-500">Total: <span className="text-green-400">{(quote.totalBuyQty || 0).toLocaleString("en-IN")}</span></div>
                          </div>
                          <div>
                            <div className="grid grid-cols-3 text-gray-500 mb-1">
                              <span>Ask</span><span className="text-right">Qty</span><span className="text-right">Ord</span>
                            </div>
                            {quote.sellDepth.map((s, i) => (
                              <div key={i} className="grid grid-cols-3 text-red-400/80 py-0.5">
                                <span>{s.price.toFixed(2)}</span>
                                <span className="text-right">{s.quantity}</span>
                                <span className="text-right">{s.orders}</span>
                              </div>
                            ))}
                            <div className="mt-1 text-gray-500">Total: <span className="text-red-400">{(quote.totalSellQty || 0).toLocaleString("en-IN")}</span></div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Exchange */}
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Exchange</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["NSE", "BSE"] as Exchange[]).map((ex) => (
                      <button
                        key={ex}
                        onClick={() => setExchange(ex)}
                        className={cn(
                          "py-1.5 text-sm font-medium rounded-md border transition-colors",
                          exchange === ex
                            ? "bg-blue-600/20 border-blue-500 text-blue-400"
                            : "bg-[#0a0f1a] border-gray-700 text-gray-400 hover:border-gray-600"
                        )}
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Transaction Type */}
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Transaction Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setTransactionType("BUY")}
                      className={cn(
                        "py-2 text-sm font-semibold rounded-md border transition-colors",
                        transactionType === "BUY"
                          ? "bg-green-600/20 border-green-500 text-green-400"
                          : "bg-[#0a0f1a] border-gray-700 text-gray-400 hover:border-gray-600"
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
                          : "bg-[#0a0f1a] border-gray-700 text-gray-400 hover:border-gray-600"
                      )}
                    >
                      SELL
                    </button>
                  </div>
                </div>

                {/* Product Type */}
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Product Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["MIS", "CNC", "NRML"] as ProductType[]).map((pt) => (
                      <button
                        key={pt}
                        onClick={() => setProductType(pt)}
                        className={cn(
                          "py-1.5 text-xs font-medium rounded-md border transition-colors",
                          productType === pt
                            ? "bg-purple-600/20 border-purple-500 text-purple-400"
                            : "bg-[#0a0f1a] border-gray-700 text-gray-400 hover:border-gray-600"
                        )}
                      >
                        {pt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Order Type */}
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Order Type</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(["MARKET", "LIMIT", "SL", "SL-M"] as OrderType[]).map((ot) => (
                      <button
                        key={ot}
                        onClick={() => setOrderType(ot)}
                        className={cn(
                          "py-1.5 text-xs font-medium rounded-md border transition-colors",
                          orderType === ot
                            ? "bg-indigo-600/20 border-indigo-500 text-indigo-400"
                            : "bg-[#0a0f1a] border-gray-700 text-gray-400 hover:border-gray-600"
                        )}
                      >
                        {ot}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quantity */}
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Quantity</label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="Enter quantity"
                    className="w-full bg-[#0a0f1a] border border-gray-700 rounded-md py-2 px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                {/* Price (for LIMIT/SL) */}
                {(orderType === "LIMIT" || orderType === "SL") && (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Price</label>
                    <input
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="Enter price"
                      step="0.05"
                      className="w-full bg-[#0a0f1a] border border-gray-700 rounded-md py-2 px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                )}

                {/* Trigger Price (for SL/SL-M) */}
                {(orderType === "SL" || orderType === "SL-M") && (
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Trigger Price</label>
                    <input
                      type="number"
                      value={triggerPrice}
                      onChange={(e) => setTriggerPrice(e.target.value)}
                      placeholder="Enter trigger price"
                      step="0.05"
                      className="w-full bg-[#0a0f1a] border border-gray-700 rounded-md py-2 px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                )}

                {/* Place Order */}
                <button
                  onClick={handlePlaceOrder}
                  disabled={isPlacingOrder || !symbol.trim() || !quantity || !connected}
                  className={cn(
                    "w-full py-2.5 rounded-md font-semibold text-sm transition-colors mt-2 flex items-center justify-center gap-2",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    transactionType === "BUY"
                      ? "bg-green-600 hover:bg-green-500 text-white"
                      : "bg-red-600 hover:bg-red-500 text-white"
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

          {/* Right Column - Positions & Orders */}
          <div className="lg:col-span-2">
            <div className="bg-[#111827] border border-gray-800 rounded-lg">
              {/* Tabs */}
              <div className="border-b border-gray-800 px-4">
                <div className="flex gap-6">
                  {(["positions", "orders", "holdings"] as TabType[]).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        "py-3 text-sm font-medium capitalize border-b-2 transition-colors",
                        activeTab === tab
                          ? "border-blue-500 text-blue-400"
                          : "border-transparent text-gray-400 hover:text-gray-300"
                      )}
                    >
                      {tab}
                      {tab === "positions" && positions.length > 0 && (
                        <span className="ml-2 text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">
                          {positions.length}
                        </span>
                      )}
                      {tab === "orders" && orders.length > 0 && (
                        <span className="ml-2 text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">
                          {orders.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4">
                {/* Positions Tab */}
                {activeTab === "positions" && (
                  <div>
                    {positions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                        <Inbox className="h-10 w-10 mb-3 text-gray-600" />
                        <p className="text-sm">No open positions.</p>
                        <p className="text-xs text-gray-600 mt-1">
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
                              <tr className="text-gray-400 text-xs border-b border-gray-800">
                                <th className="text-left py-2 px-3 font-medium">Symbol</th>
                                <th className="text-right py-2 px-3 font-medium">Qty</th>
                                <th className="text-right py-2 px-3 font-medium">Avg Price</th>
                                <th className="text-right py-2 px-3 font-medium">LTP</th>
                                <th className="text-right py-2 px-3 font-medium">P&L</th>
                                <th className="text-right py-2 px-3 font-medium">Product</th>
                                <th className="text-right py-2 px-3 font-medium"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {positions.map((pos, i) => (
                                <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                  <td className="py-2.5 px-3 font-medium">{pos.symbol}</td>
                                  <td className={cn("text-right py-2.5 px-3", pos.qty > 0 ? "text-green-400" : "text-red-400")}>
                                    {pos.qty}
                                  </td>
                                  <td className="text-right py-2.5 px-3 text-gray-300">{formatCurrency(pos.avgPrice)}</td>
                                  <td className="text-right py-2.5 px-3 text-gray-300">{formatCurrency(pos.ltp)}</td>
                                  <td className={cn("text-right py-2.5 px-3 font-medium", pos.pnl >= 0 ? "text-green-400" : "text-red-400")}>
                                    {formatCurrency(pos.pnl)}
                                  </td>
                                  <td className="text-right py-2.5 px-3">
                                    <span className="text-xs bg-gray-800 px-2 py-0.5 rounded text-gray-300">{pos.product}</span>
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
                        <div className="mt-4 pt-3 border-t border-gray-800 flex items-center justify-between">
                          <span className="text-sm text-gray-400">Net P&L</span>
                          <span className={cn("text-lg font-bold", netPnl >= 0 ? "text-green-400" : "text-red-400")}>
                            {formatCurrency(netPnl)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Orders Tab */}
                {activeTab === "orders" && (
                  <div>
                    {orders.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                        <Clock className="h-10 w-10 mb-3 text-gray-600" />
                        <p className="text-sm">No orders placed today.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-gray-400 text-xs border-b border-gray-800">
                              <th className="text-left py-2 px-3 font-medium">Time</th>
                              <th className="text-left py-2 px-3 font-medium">Symbol</th>
                              <th className="text-left py-2 px-3 font-medium">Type</th>
                              <th className="text-left py-2 px-3 font-medium">Side</th>
                              <th className="text-right py-2 px-3 font-medium">Qty</th>
                              <th className="text-right py-2 px-3 font-medium">Price</th>
                              <th className="text-right py-2 px-3 font-medium">Status</th>
                              <th className="text-right py-2 px-3 font-medium"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {orders.map((order, i) => (
                              <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                <td className="py-2.5 px-3 text-gray-400 font-mono text-xs">{order.time}</td>
                                <td className="py-2.5 px-3 font-medium">{order.symbol}</td>
                                <td className="py-2.5 px-3 text-gray-300 text-xs">{order.type}</td>
                                <td className="py-2.5 px-3">
                                  <span className={cn("text-xs font-semibold", order.side === "BUY" ? "text-green-400" : "text-red-400")}>
                                    {order.side}
                                  </span>
                                </td>
                                <td className="text-right py-2.5 px-3 text-gray-300">{order.qty}</td>
                                <td className="text-right py-2.5 px-3 text-gray-300">{formatCurrency(order.price)}</td>
                                <td className="text-right py-2.5 px-3">
                                  <span
                                    className={cn(
                                      "text-xs px-2 py-0.5 rounded-full font-medium",
                                      order.status === "COMPLETE" && "bg-green-900/50 text-green-400",
                                      order.status === "PENDING" && "bg-yellow-900/50 text-yellow-400",
                                      order.status === "REJECTED" && "bg-red-900/50 text-red-400",
                                      order.status === "CANCELLED" && "bg-gray-800 text-gray-400",
                                      order.status === "OPEN" && "bg-blue-900/50 text-blue-400"
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
                    )}
                  </div>
                )}

                {/* Holdings Tab */}
                {activeTab === "holdings" && (
                  <div>
                    {holdings.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                        <Link2 className="h-10 w-10 mb-3 text-gray-600" />
                        <p className="text-sm">No holdings found.</p>
                        <p className="text-xs text-gray-600 mt-1">
                          {connected ? "You don't have any holdings in this account." : "Connect a Zerodha account to view holdings."}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm min-w-[720px]">
                            <thead>
                              <tr className="text-gray-400 text-xs border-b border-gray-800">
                                <th className="text-left py-2 px-3 font-medium">Symbol</th>
                                <th className="text-right py-2 px-3 font-medium">Qty</th>
                                <th className="text-right py-2 px-3 font-medium">Avg Price</th>
                                <th className="text-right py-2 px-3 font-medium">LTP</th>
                                <th className="text-right py-2 px-3 font-medium">Invested</th>
                                <th className="text-right py-2 px-3 font-medium">Current Value</th>
                                <th className="text-right py-2 px-3 font-medium">P&L</th>
                                <th className="text-right py-2 px-3 font-medium">P&L %</th>
                                <th className="text-right py-2 px-3 font-medium">Day %</th>
                                <th className="text-right py-2 px-3 font-medium">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {holdings.map((holding, i) => (
                                <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                  <td className="py-2.5 px-3 font-medium">
                                    {holding.symbol}
                                    <span className="text-xs text-gray-500 ml-1">{holding.exchange}</span>
                                  </td>
                                  <td className="text-right py-2.5 px-3 text-gray-300">{holding.qty}</td>
                                  <td className="text-right py-2.5 px-3 text-gray-300">{formatCurrency(holding.avgPrice)}</td>
                                  <td className="text-right py-2.5 px-3 text-gray-300">{formatCurrency(holding.ltp)}</td>
                                  <td className="text-right py-2.5 px-3 text-gray-300">{formatCurrency(holding.invested)}</td>
                                  <td className="text-right py-2.5 px-3 text-gray-300">{formatCurrency(holding.currentValue)}</td>
                                  <td className={cn("text-right py-2.5 px-3 font-medium", holding.pnl >= 0 ? "text-green-400" : "text-red-400")}>
                                    {holding.pnl >= 0 ? "+" : ""}{formatCurrency(holding.pnl)}
                                  </td>
                                  <td className={cn("text-right py-2.5 px-3 font-medium", holding.pnlPercent >= 0 ? "text-green-400" : "text-red-400")}>
                                    {formatPercent(holding.pnlPercent)}
                                  </td>
                                  <td className="text-right py-2.5 px-3">
                                    <span className={cn("text-xs font-medium", holding.dayChange >= 0 ? "text-green-400" : "text-red-400")}>
                                      {formatPercent(holding.dayChange)}
                                    </span>
                                  </td>
                                  <td className="text-right py-2.5 px-3">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleHoldingTrade(holding, "BUY")}
                                        className="text-xs font-semibold text-blue-400 hover:text-blue-300 bg-blue-900/20 hover:bg-blue-900/40 px-2 py-1 rounded transition-colors"
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
                        <div className="mt-4 pt-3 border-t border-gray-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-gray-500">Total Invested</p>
                            <p className="font-semibold text-gray-200">{formatCurrency(holdingsTotals.invested)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Current Value</p>
                            <p className="font-semibold text-gray-200">{formatCurrency(holdingsTotals.currentValue)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Total P&L</p>
                            <p className={cn("font-semibold", holdingsTotals.pnl >= 0 ? "text-green-400" : "text-red-400")}>
                              {holdingsTotals.pnl >= 0 ? "+" : ""}{formatCurrency(holdingsTotals.pnl)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Overall P&L %</p>
                            <p className={cn("font-semibold", holdingsPnlPercent >= 0 ? "text-green-400" : "text-red-400")}>
                              {formatPercent(holdingsPnlPercent)}
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Auto-Trading Section */}
        <div className="bg-[#111827] border border-gray-800 rounded-lg p-4 sm:p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Power className="h-5 w-5 text-orange-400" />
              <h2 className="text-lg font-semibold">Auto Trading</h2>
              {autoTradingEnabled && (
                <span className="text-xs bg-green-900/50 text-green-400 px-2 py-0.5 rounded-full font-medium">
                  ACTIVE
                </span>
              )}
            </div>
            <button
              onClick={() => setAutoTradingEnabled(!autoTradingEnabled)}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                autoTradingEnabled ? "bg-green-600" : "bg-gray-700"
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  autoTradingEnabled ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Strategy</label>
              <select
                value={selectedStrategy}
                onChange={(e) => setSelectedStrategy(e.target.value)}
                className="w-full bg-[#0a0f1a] border border-gray-700 rounded-md py-2 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
              >
                {strategies.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Symbols to Trade</label>
              <input
                type="text"
                value={tradingSymbols}
                onChange={(e) => setTradingSymbols(e.target.value)}
                placeholder="RELIANCE, INFY, TCS"
                className="w-full bg-[#0a0f1a] border border-gray-700 rounded-md py-2 px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Max Orders / Day</label>
              <input
                type="number"
                value={maxOrdersPerDay}
                onChange={(e) => setMaxOrdersPerDay(e.target.value)}
                className="w-full bg-[#0a0f1a] border border-gray-700 rounded-md py-2 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Max Loss Limit (₹)</label>
              <input
                type="number"
                value={maxLossLimit}
                onChange={(e) => setMaxLossLimit(e.target.value)}
                className="w-full bg-[#0a0f1a] border border-gray-700 rounded-md py-2 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          <div className="mt-5 bg-red-900/20 border border-red-800/40 rounded-md p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-red-300 text-xs leading-relaxed">
              Auto-trading will place orders automatically based on strategy signals. Ensure proper risk management
              parameters are set. You are solely responsible for any losses incurred.
            </p>
          </div>
        </div>
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
