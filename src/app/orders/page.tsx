"use client";

import { useState, useEffect, useCallback } from "react";
import { formatCurrency } from "@/lib/utils";
import { getOrders as getFirestoreOrders, getZerodhaAccounts, type OrderRecord, type ZerodhaAccount } from "@/lib/firebase";
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
  Loader2,
  Users,
} from "lucide-react";

type OrderStatus = "EXECUTED" | "PENDING" | "REJECTED" | "CANCELLED" | "OPEN" | "COMPLETE";
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
  accountId?: string;
}

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  EXECUTED: { label: "Executed", color: "text-profit", bg: "bg-profit/10", icon: CheckCircle2 },
  COMPLETE: { label: "Executed", color: "text-profit", bg: "bg-profit/10", icon: CheckCircle2 },
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
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
}

interface PaperTrade {
  id?: string;
  timestamp?: string;
  time?: string;
  symbol?: string;
  tradingsymbol?: string;
  exchange?: string;
  side?: string;
  transaction_type?: string;
  type?: string;
  order_type?: string;
  quantity?: number;
  qty?: number;
  price?: number;
  average_price?: number;
  status?: string;
}

function mapPaperTrade(t: PaperTrade, idx: number): Order {
  return {
    id: t.id || `paper-${idx}`,
    time: t.timestamp || t.time || "",
    symbol: t.symbol || t.tradingsymbol || "UNKNOWN",
    exchange: t.exchange || "NSE",
    side: ((t.side || t.transaction_type || "BUY") as OrderSide),
    type: ((t.type || t.order_type || "MARKET") as OrderType),
    quantity: t.quantity || t.qty || 0,
    price: t.price || t.average_price || 0,
    status: ((t.status || "EXECUTED") as OrderStatus),
    mode: "PAPER",
  };
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  function mapFirestoreOrder(o: OrderRecord): Order {
    return {
      id: o.id,
      time: o.time,
      symbol: o.symbol,
      exchange: o.exchange || "NSE",
      side: o.side as OrderSide,
      type: (o.orderType || "MARKET") as OrderType,
      quantity: o.qty,
      price: o.price,
      status: (o.status === "COMPLETE" ? "EXECUTED" : o.status || "EXECUTED") as OrderStatus,
      mode: (o.mode || "PAPER") as OrderMode,
    };
  }

  const fetchAllOrders = useCallback(async () => {
    setIsLoading(true);
    const allOrders: Order[] = [];

    // Fetch live Zerodha orders from all connected accounts
    try {
      const accountsRes = await fetch("/api/zerodha/accounts");
      const accountsData = await accountsRes.json();
      const connectedAccounts = (accountsData.accounts || []).filter((a: any) => a.connected);

      for (const account of connectedAccounts) {
        try {
          const res = await fetch(`/api/zerodha/orders?accountId=${account.kiteUserId}`);
          if (res.ok) {
            const data = await res.json();
            const liveOrders: Order[] = (data.orders || []).map((o: any, idx: number) => ({
              id: o.order_id || `live-${account.kiteUserId}-${idx}`,
              time: o.order_timestamp || o.exchange_timestamp || "",
              symbol: o.tradingsymbol || "",
              exchange: o.exchange || "NSE",
              side: (o.transaction_type || "BUY") as OrderSide,
              type: (o.order_type || "MARKET") as OrderType,
              quantity: o.quantity || 0,
              price: o.average_price || o.price || 0,
              status: (o.status === "COMPLETE" ? "EXECUTED" : o.status || "PENDING") as OrderStatus,
              mode: "LIVE" as OrderMode,
              accountId: account.kiteUserId,
            }));
            allOrders.push(...liveOrders);
          }
        } catch { /* account may have expired token */ }
      }
    } catch { /* Zerodha may not be connected */ }

    // Load orders from Firestore (with localStorage fallback)
    try {
      const fsOrders = await getFirestoreOrders(100);
      if (fsOrders.length > 0) {
        allOrders.push(...fsOrders.map(mapFirestoreOrder));
      } else {
        const raw = localStorage.getItem("paperTrades");
        if (raw) {
          const parsed: PaperTrade[] = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            allOrders.push(...parsed.map(mapPaperTrade));
          }
        }
      }
    } catch {
      try {
        const raw = localStorage.getItem("paperTrades");
        if (raw) {
          const parsed: PaperTrade[] = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            allOrders.push(...parsed.map(mapPaperTrade));
          }
        }
      } catch { /* invalid localStorage data */ }
    }

    allOrders.sort((a, b) => {
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return new Date(b.time).getTime() - new Date(a.time).getTime();
    });

    setOrders(allOrders);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchAllOrders();
  }, [fetchAllOrders]);

  const filtered = orders.filter((o) => {
    if (activeTab === "paper" && o.mode !== "PAPER") return false;
    if (activeTab === "live" && o.mode !== "LIVE") return false;
    if (statusFilter !== "ALL" && o.status !== statusFilter) return false;
    if (searchQuery && !o.symbol.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const counts = {
    all: orders.length,
    paper: orders.filter((o) => o.mode === "PAPER").length,
    live: orders.filter((o) => o.mode === "LIVE").length,
  };

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
            <ClipboardList className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Orders</h1>
            <p className="text-sm text-text-secondary">Track and manage all your trading orders</p>
          </div>
        </div>
        <button
          onClick={fetchAllOrders}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-lg bg-bg-secondary px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary border border-border disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-xl bg-bg-secondary p-1 border border-border w-full sm:w-fit overflow-x-auto">
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
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-text-tertiary">Account</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-text-tertiary">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading orders...
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-text-tertiary">
                  No orders found matching your filters.
                </td>
              </tr>
            ) : (
              filtered.map((order) => {
                const sc = statusConfig[order.status] || statusConfig.PENDING;
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
                    <td className="px-4 py-3 text-center">
                      {order.accountId ? (
                        <span className="inline-block rounded-md bg-bg-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary">
                          {order.accountId}
                        </span>
                      ) : (
                        <span className="text-xs text-text-tertiary">—</span>
                      )}
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
        <span>Showing {filtered.length} of {orders.length} orders</span>
        <span>
          Total value: {formatCurrency(
            filtered
              .filter((o) => o.status === "EXECUTED" || o.status === "COMPLETE")
              .reduce((sum, o) => sum + o.price * o.quantity, 0)
          )}
        </span>
      </div>
    </div>
  );
}
