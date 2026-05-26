"use client";

import { useState, useEffect } from "react";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Circle,
  Clock,
  Link2,
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
  product: ProductType;
}

interface Order {
  time: string;
  symbol: string;
  type: OrderType;
  side: TransactionType;
  qty: number;
  price: number;
  status: "COMPLETE" | "PENDING" | "REJECTED" | "CANCELLED";
}

interface Holding {
  symbol: string;
  qty: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
  dayChange: number;
}

const mockPositions: Position[] = [
  { symbol: "RELIANCE", qty: 50, avgPrice: 2485.6, ltp: 2512.35, pnl: 1337.5, product: "MIS" },
  { symbol: "HDFCBANK", qty: -25, avgPrice: 1642.0, ltp: 1658.75, pnl: -418.75, product: "MIS" },
  { symbol: "INFY", qty: 100, avgPrice: 1485.2, ltp: 1492.8, pnl: 760.0, product: "MIS" },
  { symbol: "TCS", qty: 30, avgPrice: 3650.0, ltp: 3628.45, pnl: -646.5, product: "NRML" },
  { symbol: "ICICIBANK", qty: 75, avgPrice: 1125.5, ltp: 1138.9, pnl: 1005.0, product: "MIS" },
];

const mockOrders: Order[] = [
  { time: "09:16:32", symbol: "RELIANCE", type: "MARKET", side: "BUY", qty: 50, price: 2485.6, status: "COMPLETE" },
  { time: "09:18:45", symbol: "HDFCBANK", type: "LIMIT", side: "SELL", qty: 25, price: 1642.0, status: "COMPLETE" },
  { time: "09:22:10", symbol: "INFY", type: "MARKET", side: "BUY", qty: 100, price: 1485.2, status: "COMPLETE" },
  { time: "09:45:30", symbol: "TATAMOTORS", type: "SL", side: "BUY", qty: 200, price: 685.0, status: "PENDING" },
  { time: "10:05:12", symbol: "SBIN", type: "LIMIT", side: "BUY", qty: 150, price: 780.0, status: "REJECTED" },
  { time: "10:30:00", symbol: "TCS", type: "MARKET", side: "BUY", qty: 30, price: 3650.0, status: "COMPLETE" },
  { time: "11:15:22", symbol: "ICICIBANK", type: "MARKET", side: "BUY", qty: 75, price: 1125.5, status: "COMPLETE" },
];

const mockHoldings: Holding[] = [
  { symbol: "RELIANCE", qty: 100, avgPrice: 2320.5, ltp: 2512.35, pnl: 19185.0, dayChange: 1.25 },
  { symbol: "TCS", qty: 50, avgPrice: 3420.0, ltp: 3628.45, pnl: 10422.5, dayChange: -0.58 },
  { symbol: "INFY", qty: 200, avgPrice: 1380.0, ltp: 1492.8, pnl: 22560.0, dayChange: 0.82 },
  { symbol: "HDFCBANK", qty: 75, avgPrice: 1520.0, ltp: 1658.75, pnl: 10406.25, dayChange: 0.45 },
  { symbol: "WIPRO", qty: 300, avgPrice: 425.6, ltp: 448.9, pnl: 6990.0, dayChange: -0.32 },
  { symbol: "BAJFINANCE", qty: 20, avgPrice: 6850.0, ltp: 7245.6, pnl: 7912.0, dayChange: 1.85 },
];

const strategies = [
  "Moving Average Crossover",
  "RSI Mean Reversion",
  "VWAP Scalping",
  "Bollinger Band Breakout",
  "Opening Range Breakout",
  "Momentum Strategy",
];

export default function LiveTradingPage() {
  const [connected, setConnected] = useState(false);
  const [currentTime, setCurrentTime] = useState("");
  const [marketOpen, setMarketOpen] = useState(false);
  const [marketStatus, setMarketStatus] = useState("");

  // Order form state
  const [symbol, setSymbol] = useState("");
  const [exchange, setExchange] = useState<Exchange>("NSE");
  const [transactionType, setTransactionType] = useState<TransactionType>("BUY");
  const [productType, setProductType] = useState<ProductType>("MIS");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [triggerPrice, setTriggerPrice] = useState("");

  // Right panel tabs
  const [activeTab, setActiveTab] = useState<TabType>("positions");

  // Auto-trading state
  const [autoTradingEnabled, setAutoTradingEnabled] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState(strategies[0]);
  const [tradingSymbols, setTradingSymbols] = useState("RELIANCE, HDFCBANK, INFY");
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

  const netPnl = mockPositions.reduce((sum, p) => sum + p.pnl, 0);

  const handlePlaceOrder = () => {
    alert(
      `Order placed:\n${transactionType} ${quantity} ${symbol} @ ${orderType === "MARKET" ? "MARKET" : price}\nExchange: ${exchange} | Product: ${productType}`
    );
  };

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-white">
      {/* Connection Status Banner */}
      {!connected ? (
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
              User ID: AB1234
            </span>
          </div>
          <button
            onClick={() => setConnected(false)}
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

      <div className="p-6 space-y-6">
        {/* Demo toggle for connection */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <button
            onClick={() => setConnected(!connected)}
            className="text-blue-400 hover:text-blue-300 underline"
          >
            [Demo: Toggle Connection]
          </button>
        </div>

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
                {/* Symbol */}
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Symbol</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <input
                      type="text"
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                      placeholder="Search symbol..."
                      className="w-full bg-[#0a0f1a] border border-gray-700 rounded-md py-2 pl-9 pr-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                </div>

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
                  className={cn(
                    "w-full py-2.5 rounded-md font-semibold text-sm transition-colors mt-2",
                    transactionType === "BUY"
                      ? "bg-green-600 hover:bg-green-500 text-white"
                      : "bg-red-600 hover:bg-red-500 text-white"
                  )}
                >
                  Place {transactionType} Order
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
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4">
                {/* Positions Tab */}
                {activeTab === "positions" && (
                  <div>
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
                          {mockPositions.map((pos, i) => (
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
                  </div>
                )}

                {/* Orders Tab */}
                {activeTab === "orders" && (
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
                        {mockOrders.map((order, i) => (
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
                                  order.status === "CANCELLED" && "bg-gray-800 text-gray-400"
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

                {/* Holdings Tab */}
                {activeTab === "holdings" && (
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
                        {mockHoldings.map((holding, i) => (
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
            {/* Strategy */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Strategy</label>
              <select
                value={selectedStrategy}
                onChange={(e) => setSelectedStrategy(e.target.value)}
                className="w-full bg-[#0a0f1a] border border-gray-700 rounded-md py-2 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
              >
                {strategies.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Symbols */}
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

            {/* Max Orders */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Max Orders / Day</label>
              <input
                type="number"
                value={maxOrdersPerDay}
                onChange={(e) => setMaxOrdersPerDay(e.target.value)}
                className="w-full bg-[#0a0f1a] border border-gray-700 rounded-md py-2 px-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Max Loss */}
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

          {/* Auto-trading warning */}
          <div className="mt-5 bg-red-900/20 border border-red-800/40 rounded-md p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-red-300 text-xs leading-relaxed">
              Auto-trading will place orders automatically based on strategy signals. Ensure proper risk management
              parameters are set. You are solely responsible for any losses incurred. Past strategy performance does
              not guarantee future results.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
