"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Inbox,
  Link2,
  Loader2,
  Power,
  Search,
  ShieldAlert,
  Zap,
} from "lucide-react";
import { cn, formatCurrency, formatPercent, isMarketOpen, getMarketStatus } from "@/lib/utils";

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
  qty: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
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
}

const POPULAR_STOCKS = [
  "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
  "HINDUNILVR", "ITC", "SBIN", "BHARTIARTL", "KOTAKBANK",
  "LT", "AXISBANK", "MARUTI", "BAJFINANCE", "TITAN",
  "SUNPHARMA", "WIPRO", "HCLTECH", "TATAMOTORS", "TATASTEEL",
  "POWERGRID", "NTPC", "ONGC", "ADANIENT", "TECHM",
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

  const [connected, setConnected] = useState(false);
  const [kiteUserId, setKiteUserId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

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
  const [showSuggestions, setShowSuggestions] = useState(false);
  const filteredStocks = symbol.length > 0
    ? POPULAR_STOCKS.filter((s) => s.startsWith(symbol.toUpperCase()))
    : POPULAR_STOCKS;

  const [activeTab, setActiveTab] = useState<TabType>("positions");

  const [autoTradingEnabled, setAutoTradingEnabled] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState(strategies[0]);
  const [tradingSymbols, setTradingSymbols] = useState("");
  const [maxOrdersPerDay, setMaxOrdersPerDay] = useState("20");
  const [maxLossLimit, setMaxLossLimit] = useState("5000");

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

  const checkAuthStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/zerodha/status");
      const data = await res.json();
      if (data.connected) {
        setConnected(true);
        setKiteUserId(data.userId || "");
      }
    } catch {
      // Not connected
    } finally {
      setIsCheckingAuth(false);
    }
  }, []);

  useEffect(() => {
    const error = searchParams.get("error");
    if (error && ERROR_MESSAGES[error]) {
      setErrorMessage(ERROR_MESSAGES[error]);
      setIsCheckingAuth(false);
      return;
    }

    checkAuthStatus();
  }, [searchParams, checkAuthStatus]);

  const fetchPositions = useCallback(async () => {
    try {
      const res = await fetch("/api/zerodha/positions");
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
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/zerodha/orders");
      if (!res.ok) return;
      const data = await res.json();
      const mapped: KiteOrder[] = (data.orders || []).map((o: any) => ({
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
  }, []);

  const fetchHoldings = useCallback(async () => {
    try {
      const res = await fetch("/api/zerodha/holdings");
      if (!res.ok) return;
      const data = await res.json();
      const mapped: Holding[] = (data.holdings || []).map((h: any) => ({
        symbol: h.tradingsymbol,
        qty: h.quantity,
        avgPrice: h.average_price,
        ltp: h.last_price,
        pnl: h.pnl,
        dayChange: h.day_change_percentage || 0,
      }));
      setHoldings(mapped);
    } catch { /* ignore */ }
  }, []);

  const fetchQuote = useCallback(async (sym: string) => {
    if (!sym.trim() || !connected) return;
    setIsLoadingQuote(true);
    try {
      const res = await fetch(`/api/zerodha/quote?symbol=${encodeURIComponent(sym.trim())}&exchange=${exchange}`);
      if (!res.ok) {
        setQuote(null);
        return;
      }
      const data = await res.json();
      setQuote(data);
    } catch {
      setQuote(null);
    } finally {
      setIsLoadingQuote(false);
    }
  }, [connected, exchange]);

  useEffect(() => {
    if (!symbol.trim() || !connected) return;
    const timer = setTimeout(() => fetchQuote(symbol), 600);
    return () => clearTimeout(timer);
  }, [symbol, exchange, connected, fetchQuote]);

  useEffect(() => {
    if (!connected) return;
    fetchPositions();
    fetchOrders();
    fetchHoldings();

    const interval = setInterval(() => {
      fetchPositions();
      fetchOrders();
    }, 30000);
    return () => clearInterval(interval);
  }, [connected, fetchPositions, fetchOrders, fetchHoldings]);

  const netPnl = positions.reduce((sum, p) => sum + p.pnl, 0);

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

      setStatusMessage(`Order placed successfully! Order ID: ${data.orderId}`);
      setSymbol("");
      setQuantity("");
      setPrice("");
      setTriggerPrice("");

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

  const handleDisconnect = async () => {
    await fetch("/api/zerodha/logout", { method: "POST" }).catch(() => {});
    setConnected(false);
    setKiteUserId("");
    setPositions([]);
    setOrders([]);
    setHoldings([]);
  };

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-white">
      {/* Connection Status Banner */}
      {isCheckingAuth ? (
        <div className="bg-gray-900/40 border-b border-gray-700/50 px-6 py-3 flex items-center gap-3">
          <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
          <span className="text-gray-300 text-sm font-medium">Checking Zerodha connection...</span>
        </div>
      ) : !connected ? (
        <div className="bg-amber-900/40 border-b border-amber-700/50 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            <span className="text-amber-200 text-sm font-medium">
              Zerodha not connected. Connect to place live orders.
            </span>
          </div>
          <a
            href="/api/zerodha/login"
            className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm rounded transition-colors"
          >
            Connect to Zerodha
          </a>
        </div>
      ) : (
        <div className="bg-emerald-900/40 border-b border-emerald-700/50 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <span className="text-emerald-200 text-sm font-medium">
              Connected to Zerodha
            </span>
            <span className="text-emerald-400/70 text-xs bg-emerald-900/50 px-2 py-0.5 rounded">
              User ID: {kiteUserId}
            </span>
          </div>
          <button
            onClick={handleDisconnect}
            className="px-4 py-1.5 bg-emerald-700/50 hover:bg-emerald-700 text-emerald-200 text-sm rounded transition-colors"
          >
            Disconnect
          </button>
        </div>
      )}

      {/* Market Status Bar */}
      <div className="bg-[#111827] border-b border-gray-800 px-6 py-2.5 flex items-center justify-between">
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
          <span className="text-gray-500 text-xs">|</span>
          <span className="text-gray-400 text-xs">Trading Hours: 9:15 AM - 3:30 PM IST</span>
        </div>
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Clock className="h-4 w-4" />
          <span>{currentTime} IST</span>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="bg-red-900/40 border-b border-red-700/50 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-red-400 shrink-0" />
            <span className="text-red-200 text-sm font-medium">{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage("")} className="text-red-400 hover:text-red-300 text-sm">
            Dismiss
          </button>
        </div>
      )}

      {/* Success Banner */}
      {statusMessage && (
        <div className="bg-emerald-900/40 border-b border-emerald-700/50 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <span className="text-emerald-200 text-sm font-medium">{statusMessage}</span>
          </div>
          <button onClick={() => setStatusMessage("")} className="text-emerald-400 hover:text-emerald-300 text-sm">
            Dismiss
          </button>
        </div>
      )}

      <div className="p-6 space-y-6">
        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Order Placement */}
          <div className="lg:col-span-1">
            <div className="bg-[#111827] border border-gray-800 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-5">
                <Zap className="h-5 w-5 text-yellow-400" />
                <h2 className="text-lg font-semibold">Place Order</h2>
              </div>

              {/* Warning Banner */}
              <div className="bg-red-900/30 border border-red-800/50 rounded-md p-3 mb-5 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                <p className="text-red-300 text-xs leading-relaxed">
                  This will place REAL orders on Zerodha. Use with caution.
                </p>
              </div>

              <div className="space-y-4">
                {/* Symbol with search suggestions */}
                <div className="relative">
                  <label className="text-xs text-gray-400 mb-1 block">Symbol</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <input
                      type="text"
                      value={symbol}
                      onChange={(e) => { setSymbol(e.target.value.toUpperCase()); setShowSuggestions(true); }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      placeholder="e.g. RELIANCE"
                      className="w-full bg-[#0a0f1a] border border-gray-700 rounded-md py-2 pl-9 pr-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                    {isLoadingQuote && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-400 animate-spin" />
                    )}
                  </div>
                  {showSuggestions && filteredStocks.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-[#1a2035] border border-gray-700 rounded-md shadow-xl max-h-48 overflow-y-auto">
                      {filteredStocks.map((s) => (
                        <button
                          key={s}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { setSymbol(s); setShowSuggestions(false); }}
                          className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-blue-600/20 hover:text-white transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Stock Quote Panel */}
                {quote && (
                  <div className="bg-[#0a0f1a] border border-gray-700 rounded-md p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{quote.symbol}</span>
                      <span className={cn("text-lg font-bold", quote.changePercent >= 0 ? "text-green-400" : "text-red-400")}>
                        {formatCurrency(quote.lastPrice)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded", quote.changePercent >= 0 ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400")}>
                        {quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)} ({formatPercent(quote.changePercent)})
                      </span>
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

                    {/* Market Depth */}
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

                {/* Place Order Button */}
                <button
                  onClick={handlePlaceOrder}
                  disabled={isPlacingOrder || !symbol.trim() || !quantity}
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
                          {connected ? "Place an order to see positions here." : "Connect to Zerodha to view positions."}
                        </p>
                      </div>
                    ) : (
                      <>
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
                          {connected ? "You don't have any holdings in your Zerodha account." : "Connect to Zerodha to view your holdings."}
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-gray-400 text-xs border-b border-gray-800">
                              <th className="text-left py-2 px-3 font-medium">Symbol</th>
                              <th className="text-right py-2 px-3 font-medium">Qty</th>
                              <th className="text-right py-2 px-3 font-medium">Avg Price</th>
                              <th className="text-right py-2 px-3 font-medium">LTP</th>
                              <th className="text-right py-2 px-3 font-medium">P&L</th>
                              <th className="text-right py-2 px-3 font-medium">Day Change</th>
                            </tr>
                          </thead>
                          <tbody>
                            {holdings.map((holding, i) => (
                              <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                                <td className="py-2.5 px-3 font-medium">{holding.symbol}</td>
                                <td className="text-right py-2.5 px-3 text-gray-300">{holding.qty}</td>
                                <td className="text-right py-2.5 px-3 text-gray-300">{formatCurrency(holding.avgPrice)}</td>
                                <td className="text-right py-2.5 px-3 text-gray-300">{formatCurrency(holding.ltp)}</td>
                                <td className={cn("text-right py-2.5 px-3 font-medium", holding.pnl >= 0 ? "text-green-400" : "text-red-400")}>
                                  {formatCurrency(holding.pnl)}
                                </td>
                                <td className="text-right py-2.5 px-3">
                                  <span className={cn("text-xs font-medium", holding.dayChange >= 0 ? "text-green-400" : "text-red-400")}>
                                    {formatPercent(holding.dayChange)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Auto-Trading Section */}
        <div className="bg-[#111827] border border-gray-800 rounded-lg p-6">
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

export default function LiveTradingPage() {
  return (
    <Suspense>
      <LiveTradingContent />
    </Suspense>
  );
}
