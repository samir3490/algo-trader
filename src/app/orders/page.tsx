"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import {
  ClipboardList,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

type OrderStatus = "EXECUTED" | "PENDING" | "REJECTED" | "CANCELLED" | "OPEN";
type OrderSide = "BUY" | "SELL";
type OrderMode = "PAPER" | "LIVE";
type OrderType = "MARKET" | "LIMIT" | "SL" | "SL-M";
type TabKey = "all" | "paper" | "live";

interface Order {
  id: string;
  time: string;
  symbol: string;
  exchange: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price: number;
  status: OrderStatus;
  mode: OrderMode;
}

const mockOrders: Order[] = [
  { id: "ORD001", time: "2026-05-26T09:15:32", symbol: "RELIANCE", exchange: "NSE", side: "BUY", type: "MARKET", quantity: 50, price: 2487.35, status: "EXECUTED", mode: "LIVE" },
  { id: "ORD002", time: "2026-05-26T09:18:45", symbol: "TCS", exchange: "NSE", side: "BUY", type: "LIMIT", quantity: 25, price: 3654.00, status: "PENDING", mode: "LIVE" },
  { id: "ORD003", time: "2026-05-26T09:22:10", symbol: "INFY", exchange: "NSE", side: "SELL", type: "MARKET", quantity: 100, price: 1478.90, status: "EXECUTED", mode: "PAPER" },
  { id: "ORD004", time: "2026-05-26T09:30:00", symbol: "HDFCBANK", exchange: "NSE", side: "BUY", type: "SL", quantity: 75, price: 1623.50, status: "OPEN", mode: "LIVE" },
  { id: "ORD005", time: "2026-05-26T09:35:22", symbol: "ICICIBANK", exchange: "NSE", side: "SELL", type: "LIMIT", quantity: 200, price: 945.75, status: "REJECTED", mode: "PAPER" },
  { id: "ORD006", time: "2026-05-26T09:42:15", symbol: "SBIN", exchange: "NSE", side: "BUY", type: "MARKET", quantity: 150, price: 578.20, status: "EXECUTED", mode: "PAPER" },
  { id: "ORD007", time: "2026-05-26T10:05:33", symbol: "WIPRO", exchange: "NSE", side: "BUY", type: "SL-M", quantity: 300, price: 412.60, status: "CANCELLED", mode: "LIVE" },
  { id: "ORD008", time: "2026-05-26T10:12:48", symbol: "TATAMOTORS", exchange: "NSE", side: "SELL", type: "MARKET", quantity: 80, price: 652.30, status: "EXECUTED", mode: "PAPER" },
  { id: "ORD009", time: "2026-05-26T10:25:10", symbol: "BAJFINANCE", exchange: "NSE", side: "BUY", type: "LIMIT", quantity: 30, price: 6780.00, status: "PENDING", mode: "LIVE" },
  { id: "ORD010", time: "2026-05-26T10:30:55", symbol: "MARUTI", exchange: "NSE", side: "SELL", type: "MARKET", quantity: 10, price: 12345.50, status: "EXECUTED", mode: "PAPER" },
  { id: "ORD011", time: "2026-05-26T10:45:20", symbol: "ADANIENT", exchange: "NSE", side: "BUY", type: "SL", quantity: 120, price: 2310.75, status: "OPEN", mode: "PAPER" },
  { id: "ORD012", time: "2026-05-26T11:02:00", symbol: "AXISBANK", exchange: "NSE", side: "BUY", type: "MARKET", quantity: 60, price: 1085.40, status: "EXECUTED", mode: "LIVE" },
  { id: "ORD013", time: "2026-05-26T11:15:30", symbol: "SUNPHARMA", exchange: "NSE", side: "SELL", type: "LIMIT", quantity: 90, price: 1125.00, status: "REJECTED", mode: "LIVE" },
];

const statusConfig: Record<OrderStatus, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  EXECUTED: { label: "Executed", color: "text-profit", bg: "bg-profit/10", icon: CheckCircle2 },
  PENDING: { label: "Pending", color: "text-warning", bg: "bg-warning/10", icon: Clock },
  OPEN: { label: "Open", color: "text-info", bg: "bg-info/10", icon: AlertCircle },
  REJECTED: { label: "Rejected", color: "text-loss", bg: "bg-loss/10", icon: XCircle },
  CANCELLED: { label: "Cancelled", color: "text-text-tertiary", bg: "bg-bg-tertiary", icon: XCircle },
};

const tabs: { key: TabKey; label: string }[] = [
  { key: "all", label: "All Orders" },
  { key: "paper", label: "Paper Orders" },
  { key: "live", label: "Live Orders" },
];

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
}

export default function OrdersPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = mockOrders.filter((o) => {
    if (activeTab === "paper" && o.mode !== "PAPER") return false;
    if (activeTab === "live" && o.mode !== "LIVE") return false;
    if (statusFilter !== "ALL" && o.status !== statusFilter) return false;
    if (searchQuery && !o.symbol.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const counts = {
    all: mockOrders.length,
    paper: mockOrders.filter((o) => o.mode === "PAPER").length,
    live: mockOrders.filter((o) => o.mode === "LIVE").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
            <ClipboardList className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Orders</h1>
            <p className="text-sm text-text-secondary">Track and manage all your trading orders</p>
          </div>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-bg-secondary px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary border border-border">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-xl bg-bg-secondary p-1 border border-border w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === tab.key
                ? "bg-accent text-white shadow-sm"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
            }`}
          >
            {tab.label}
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                activeTab === tab.key
                  ? "bg-white/20 text-white"
                  : "bg-bg-tertiary text-text-tertiary"
              }`}
            >
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search by symbol..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-border bg-bg-secondary py-2 pl-10 pr-4 text-sm text-text-primary placeholder-text-tertiary outline-none transition-colors focus:border-accent"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OrderStatus | "ALL")}
            className="appearance-none rounded-lg border border-border bg-bg-secondary py-2 pl-10 pr-8 text-sm text-text-primary outline-none transition-colors focus:border-accent cursor-pointer"
          >
            <option value="ALL">All Status</option>
            <option value="EXECUTED">Executed</option>
            <option value="PENDING">Pending</option>
            <option value="OPEN">Open</option>
            <option value="REJECTED">Rejected</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="rounded-xl border border-border bg-bg-secondary overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-tertiary">Time</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-tertiary">Symbol</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-tertiary">Side</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-tertiary">Type</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary">Qty</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-text-tertiary">Price</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-text-tertiary">Status</th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-text-tertiary">Mode</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-text-tertiary">
                  No orders found matching your filters.
                </td>
              </tr>
            ) : (
              filtered.map((order) => {
                const sc = statusConfig[order.status];
                const StatusIcon = sc.icon;
                return (
                  <tr key={order.id} className="transition-colors hover:bg-bg-hover/50">
                    <td className="px-4 py-3 text-sm text-text-secondary font-mono">
                      {formatTime(order.time)}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <span className="text-sm font-semibold text-text-primary">{order.symbol}</span>
                        <span className="ml-2 text-xs text-text-tertiary">{order.exchange}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-sm font-semibold ${
                        order.side === "BUY" ? "text-profit" : "text-loss"
                      }`}>
                        {order.side === "BUY" ? (
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDownRight className="h-3.5 w-3.5" />
                        )}
                        {order.side}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{order.type}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-text-primary">{order.quantity}</td>
                    <td className="px-4 py-3 text-right text-sm font-medium text-text-primary font-mono">
                      {formatCurrency(order.price)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${sc.color} ${sc.bg}`}>
                        <StatusIcon className="h-3 w-3" />
                        {sc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${
                        order.mode === "LIVE"
                          ? "bg-loss/10 text-loss"
                          : "bg-accent/10 text-accent"
                      }`}>
                        {order.mode}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Summary */}
      <div className="flex items-center justify-between text-sm text-text-tertiary">
        <span>Showing {filtered.length} of {mockOrders.length} orders</span>
        <span>
          Total value: {formatCurrency(
            filtered
              .filter((o) => o.status === "EXECUTED")
              .reduce((sum, o) => sum + o.price * o.quantity, 0)
          )}
        </span>
      </div>
    </div>
  );
}
