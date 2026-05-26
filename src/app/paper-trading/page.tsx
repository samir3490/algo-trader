"use client";

import { useState } from "react";
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
} from "lucide-react";
import { cn, formatCurrency, formatPercent, formatNumber } from "@/lib/utils";

type OrderSide = "BUY" | "SELL";
type OrderType = "MARKET" | "LIMIT";
type Exchange = "NSE" | "BSE";

interface Holding {
  symbol: string;
  qty: number;
  avgPrice: number;
  ltp: number;
}

interface Trade {
  id: string;
  time: string;
  symbol: string;
  side: OrderSide;
  qty: number;
  price: number;
}

const INITIAL_BALANCE = 1000000;

const initialHoldings: Holding[] = [
  { symbol: "RELIANCE", qty: 10, avgPrice: 2450, ltp: 2520 },
  { symbol: "TCS", qty: 5, avgPrice: 3800, ltp: 3750 },
  { symbol: "INFY", qty: 20, avgPrice: 1550, ltp: 1620 },
  { symbol: "HDFCBANK", qty: 8, avgPrice: 1680, ltp: 1710 },
];

const initialTrades: Trade[] = [
  { id: "t1", time: "14:32:15", symbol: "RELIANCE", side: "BUY", qty: 10, price: 2450 },
  { id: "t2", time: "13:45:02", symbol: "TCS", side: "BUY", qty: 5, price: 3800 },
  { id: "t3", time: "12:18:44", symbol: "HDFCBANK", side: "BUY", qty: 8, price: 1680 },
  { id: "t4", time: "11:55:30", symbol: "SBIN", side: "SELL", qty: 15, price: 625 },
  { id: "t5", time: "11:02:11", symbol: "INFY", side: "BUY", qty: 20, price: 1550 },
  { id: "t6", time: "10:30:45", symbol: "TATAMOTORS", side: "SELL", qty: 12, price: 980 },
];

function computePortfolio(holdings: Holding[], baseBalance: number) {
  const invested = holdings.reduce((sum, h) => sum + h.qty * h.avgPrice, 0);
  const currentValue = holdings.reduce((sum, h) => sum + h.qty * h.ltp, 0);
  const pnl = currentValue - invested;
  const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;
  const balance = baseBalance - invested;
  return { balance, invested, currentValue, pnl, pnlPercent };
}

export default function PaperTradingPage() {
  const [holdings, setHoldings] = useState<Holding[]>(initialHoldings);
  const [trades, setTrades] = useState<Trade[]>(initialTrades);
  const [baseBalance, setBaseBalance] = useState(INITIAL_BALANCE);

  const [orderSide, setOrderSide] = useState<OrderSide>("BUY");
  const [symbol, setSymbol] = useState("");
  const [exchange, setExchange] = useState<Exchange>("NSE");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [qty, setQty] = useState("");
  const [limitPrice, setLimitPrice] = useState("");

  const portfolio = computePortfolio(holdings, baseBalance);

  const estimatedPrice = orderType === "LIMIT" && limitPrice ? parseFloat(limitPrice) : 0;
  const estimatedCost = qty ? (orderType === "LIMIT" && limitPrice ? parseFloat(limitPrice) : 0) * parseInt(qty || "0") : 0;

  function handlePlaceOrder() {
    const qtyNum = parseInt(qty);
    if (!symbol.trim() || !qtyNum || qtyNum <= 0) return;

    const price =
      orderType === "LIMIT" && limitPrice
        ? parseFloat(limitPrice)
        : Math.round(1000 + Math.random() * 3000);

    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-IN", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const newTrade: Trade = {
      id: `t${Date.now()}`,
      time: timeStr,
      symbol: symbol.toUpperCase().trim(),
      side: orderSide,
      qty: qtyNum,
      price,
    };

    setTrades((prev) => [newTrade, ...prev]);

    const sym = symbol.toUpperCase().trim();
    setHoldings((prev) => {
      const existing = prev.find((h) => h.symbol === sym);
      if (orderSide === "BUY") {
        if (existing) {
          const newQty = existing.qty + qtyNum;
          const newAvg =
            (existing.avgPrice * existing.qty + price * qtyNum) / newQty;
          return prev.map((h) =>
            h.symbol === sym ? { ...h, qty: newQty, avgPrice: Math.round(newAvg * 100) / 100 } : h
          );
        }
        return [...prev, { symbol: sym, qty: qtyNum, avgPrice: price, ltp: price }];
      } else {
        if (!existing || existing.qty < qtyNum) return prev;
        const newQty = existing.qty - qtyNum;
        if (newQty === 0) return prev.filter((h) => h.symbol !== sym);
        return prev.map((h) => (h.symbol === sym ? { ...h, qty: newQty } : h));
      }
    });

    setSymbol("");
    setQty("");
    setLimitPrice("");
  }

  function handleReset() {
    setHoldings(initialHoldings);
    setTrades(initialTrades);
    setBaseBalance(INITIAL_BALANCE);
    setSymbol("");
    setQty("");
    setLimitPrice("");
    setOrderSide("BUY");
    setOrderType("MARKET");
  }

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
      color: "text-yellow-400",
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
              Practice trading with virtual money using real market data
            </p>
          </div>
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-bg-tertiary border border-border
                       text-text-secondary hover:text-text-primary hover:border-border-light
                       transition-all duration-200 text-sm self-start sm:self-auto cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Reset Portfolio
          </button>
        </div>

        {/* Portfolio Summary Bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {summaryItems.map((item) => (
            <div
              key={item.label}
              className="card flex items-center gap-3"
            >
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

      {/* Main Content: Order Form + Holdings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-6">
        {/* Order Form */}
        <div className="lg:col-span-1 card">
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            Place Order
          </h2>

          {/* BUY / SELL Tabs */}
          <div className="flex rounded-lg bg-bg-primary p-1 mb-5">
            {(["BUY", "SELL"] as const).map((side) => (
              <button
                key={side}
                onClick={() => setOrderSide(side)}
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

          {/* Symbol */}
          <div className="mb-4">
            <label className="block text-xs text-text-tertiary uppercase tracking-wider mb-1.5">
              Symbol
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <input
                type="text"
                placeholder="e.g. RELIANCE"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-bg-primary border border-border
                           text-text-primary placeholder:text-text-tertiary text-sm
                           focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          </div>

          {/* Exchange + Order Type */}
          <div className="grid grid-cols-2 gap-3 mb-4">
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
          </div>

          {/* Quantity */}
          <div className="mb-4">
            <label className="block text-xs text-text-tertiary uppercase tracking-wider mb-1.5">
              Quantity
            </label>
            <input
              type="number"
              min={1}
              placeholder="0"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-bg-primary border border-border
                         text-text-primary placeholder:text-text-tertiary text-sm
                         focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          {/* Price (LIMIT only) */}
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
                onChange={(e) => setLimitPrice(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-bg-primary border border-border
                           text-text-primary placeholder:text-text-tertiary text-sm
                           focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          )}

          {/* Estimated Cost */}
          {orderType === "LIMIT" && estimatedCost > 0 && (
            <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-bg-primary mb-5">
              <span className="text-xs text-text-tertiary">Estimated Cost</span>
              <span className="text-sm font-semibold text-text-primary">
                {formatCurrency(estimatedCost)}
              </span>
            </div>
          )}

          {/* Place Order Button */}
          <button
            onClick={handlePlaceOrder}
            disabled={!symbol.trim() || !qty || parseInt(qty) <= 0}
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

        {/* Holdings Table */}
        <div className="lg:col-span-2 card">
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            Holdings
          </h2>

          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">
                    Symbol
                  </th>
                  <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">
                    Qty
                  </th>
                  <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">
                    Avg Price
                  </th>
                  <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">
                    LTP
                  </th>
                  <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">
                    Current Value
                  </th>
                  <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">
                    P&L
                  </th>
                  <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">
                    P&L %
                  </th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  const currentVal = h.qty * h.ltp;
                  const investedVal = h.qty * h.avgPrice;
                  const pnl = currentVal - investedVal;
                  const pnlPct = (pnl / investedVal) * 100;
                  const isProfit = pnl >= 0;

                  return (
                    <tr
                      key={h.symbol}
                      className="border-b border-border/50 hover:bg-bg-hover/50 transition-colors"
                    >
                      <td className="py-3 px-5 font-medium text-text-primary">
                        {h.symbol}
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
                      <td className="py-3 px-5 text-right text-text-primary">
                        {formatCurrency(currentVal)}
                      </td>
                      <td
                        className={cn(
                          "py-3 px-5 text-right font-medium",
                          isProfit ? "text-profit" : "text-loss"
                        )}
                      >
                        <span className="inline-flex items-center gap-1">
                          {isProfit ? (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDownRight className="w-3.5 h-3.5" />
                          )}
                          {isProfit ? "+" : ""}
                          {formatCurrency(pnl)}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "py-3 px-5 text-right font-medium",
                          isProfit ? "text-profit" : "text-loss"
                        )}
                      >
                        {formatPercent(pnlPct)}
                      </td>
                    </tr>
                  );
                })}
                {holdings.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-12 text-center text-text-tertiary"
                    >
                      No holdings yet. Place your first order!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Trade History */}
      <div className="card">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          Trade History
        </h2>

        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm min-w-[550px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">
                  Time
                </th>
                <th className="text-left text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">
                  Symbol
                </th>
                <th className="text-left text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">
                  Side
                </th>
                <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">
                  Qty
                </th>
                <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">
                  Price
                </th>
                <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-5">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => {
                const isBuy = t.side === "BUY";
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
                    <td className="py-3 px-5 text-text-secondary font-mono text-xs">
                      {t.time}
                    </td>
                    <td className="py-3 px-5 font-medium text-text-primary">
                      {t.symbol}
                    </td>
                    <td className="py-3 px-5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold",
                          isBuy
                            ? "bg-profit/15 text-profit"
                            : "bg-loss/15 text-loss"
                        )}
                      >
                        {isBuy ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" />
                        )}
                        {t.side}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-right text-text-secondary">
                      {formatNumber(t.qty)}
                    </td>
                    <td className="py-3 px-5 text-right text-text-primary">
                      {formatCurrency(t.price)}
                    </td>
                    <td className="py-3 px-5 text-right text-text-primary font-medium">
                      {formatCurrency(t.qty * t.price)}
                    </td>
                  </tr>
                );
              })}
              {trades.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-12 text-center text-text-tertiary"
                  >
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
