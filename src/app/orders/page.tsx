"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTableSort } from "@/hooks/use-table-sort";
import SortableTh from "@/components/ui/sortable-th";
import {
  cn,
  formatCurrency,
  formatDateTimeCompactIST,
  formatDateTimeIST,
  parseDateTimeMs,
  tableDateTimeThClass,
  tableDateTimeTdClass,
} from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  getOrders as getFirestoreOrders,
  getPaperTradingState,
  type OrderRecord,
} from "@/lib/firebase";
import {
  mergePaperOrderRecords,
} from "@/lib/paper-trades/normalize";
import {
  buildSectorBiasContext,
  formatTradeReasonWithSector,
  lookupSectorBias,
  pickRicherReason,
  type SectorBiasContext,
} from "@/lib/portfolio/sector-bias";
import { normalizeExitReasonLabel } from "@/lib/portfolio/exit-label";
import PaperExportMenu from "@/components/paper-export-menu";
import PageHeader from "@/components/ui/page-header";
import EmptyState from "@/components/ui/empty-state";
import DataTable from "@/components/ui/data-table";
import Button from "@/components/ui/button";
import { SkeletonTable } from "@/components/ui/skeleton";
import { useOptionalToast } from "@/components/ui/toast";
import {
  downloadCombinedOrdersCsv,
  downloadLiveOrdersCsv,
} from "@/lib/export/live-data-export";
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
  Download,
} from "lucide-react";

type OrderStatus = "EXECUTED" | "PENDING" | "REJECTED" | "CANCELLED" | "OPEN" | "COMPLETE";
type OrderSide = "BUY" | "SELL";
type OrderMode = "PAPER" | "LIVE";
type OrderType = "MARKET" | "LIMIT" | "SL" | "SL-M";
type TabKey = "all" | "paper" | "live";

interface Order {
  id: string;
  time: string;
  date?: string;
  symbol: string;
  exchange: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price: number;
  status: OrderStatus;
  mode: OrderMode;
  accountId?: string;
  strategyName?: string;
  reason?: string;
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

interface PaperTrade {
  id?: string;
  timestamp?: string;
  time?: string;
  date?: string;
  executedAt?: string;
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
  reason?: string;
  strategyName?: string;
  exitReason?: string;
}

function formatOrderReason(order: {
  reason?: string;
  strategyName?: string;
  side?: string;
  exitReason?: string;
  symbol?: string;
}): string {
  const reason = normalizeExitReasonLabel(order.reason);
  if (reason) return reason;
  if (order.exitReason) {
    return `Exit — ${String(order.exitReason).replace(/_/g, " ")}`;
  }
  if (order.strategyName) {
    return `${order.side ?? "TRADE"} · ${order.strategyName}`;
  }
  return "";
}

/** Match email detail: append sector performance when missing from stored reason. */
function withSectorDetail(
  order: Pick<Order, "reason" | "side" | "symbol" | "strategyName">,
  sectorBias: SectorBiasContext | null
): string {
  const base =
    normalizeExitReasonLabel(order.reason) ||
    (order.strategyName
      ? `${order.side} · ${order.strategyName}`
      : order.side);
  if (!base) return "";
  if (/Preferred sector|Sector context/i.test(base)) return base;
  return formatTradeReasonWithSector({
    baseReason: base,
    side: order.side,
    entry: lookupSectorBias(order.symbol, sectorBias),
    symbol: order.symbol,
  });
}

function mapPaperTrade(t: PaperTrade, idx: number): Order {
  return {
    id: t.id || `paper-${idx}`,
    time: t.executedAt || t.timestamp || t.time || "",
    date: t.date,
    symbol: t.symbol || t.tradingsymbol || "UNKNOWN",
    exchange: t.exchange || "NSE",
    side: ((t.side || t.transaction_type || "BUY") as OrderSide),
    type: ((t.type || t.order_type || "MARKET") as OrderType),
    quantity: t.quantity || t.qty || 0,
    price: t.price || t.average_price || 0,
    status: ((t.status || "EXECUTED") as OrderStatus),
    mode: "PAPER",
    strategyName: t.strategyName,
    reason: formatOrderReason(t),
  };
}

export default function OrdersPage() {
  const { user } = useAuth();
  const toast = useOptionalToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [strategyFilter, setStrategyFilter] = useState<string>("ALL");
  const [accountFilter, setAccountFilter] = useState<string>("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  function mapFirestoreOrder(o: OrderRecord): Order {
    return {
      id: o.id,
      time: o.time,
      date: o.date,
      symbol: o.symbol,
      exchange: o.exchange || "NSE",
      side: o.side as OrderSide,
      type: (o.orderType || "MARKET") as OrderType,
      quantity: o.qty,
      price: o.price,
      status: (o.status === "COMPLETE" ? "EXECUTED" : o.status || "EXECUTED") as OrderStatus,
      mode: (o.mode || "PAPER") as OrderMode,
      strategyName: o.strategyName,
      reason: formatOrderReason(o),
    };
  }

  const fetchAllOrders = useCallback(async () => {
    setIsLoading(true);
    const allOrders: Order[] = [];

    let sectorBias: SectorBiasContext | null = null;
    try {
      const sectorRes = await fetch("/api/market/sectors?timeframe=1d");
      if (sectorRes.ok) {
        const sectorData = await sectorRes.json();
        if (Array.isArray(sectorData?.sectors)) {
          sectorBias = buildSectorBiasContext(sectorData.sectors, sectorData.fetchedAt);
        }
      }
    } catch {
      /* sector enrichment optional */
    }

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
              reason: o.tag || o.status_message || undefined,
            }));
            allOrders.push(...liveOrders);
          }
        } catch { /* account may have expired token */ }
      }
    } catch { /* Zerodha may not be connected */ }

    // Paper orders: merge Firestore order history with paper trades (includes SELL exits).
    try {
      const [fsOrders, paperState] = await Promise.all([
        getFirestoreOrders(),
        getPaperTradingState(),
      ]);

      const deduped = mergePaperOrderRecords(
        paperState?.trades ?? [],
        fsOrders
      );
      const reasonById = new Map(
        (paperState?.trades ?? []).map((t) => [t.id, t.reason])
      );
      allOrders.push(
        ...deduped.map((o) => {
          const mapped = mapFirestoreOrder(o);
          mapped.reason = withSectorDetail(
            {
              ...mapped,
              reason:
                pickRicherReason(mapped.reason, reasonById.get(o.id)) ||
                mapped.reason,
            },
            sectorBias
          );
          return mapped;
        })
      );
    } catch {
      try {
        const raw = localStorage.getItem("paperTrades");
        if (raw) {
          const parsed: PaperTrade[] = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            allOrders.push(
              ...parsed.map((t, idx) => {
                const mapped = mapPaperTrade(t, idx);
                mapped.reason = withSectorDetail(mapped, sectorBias);
                return mapped;
              })
            );
          }
        }
      } catch { /* invalid localStorage data */ }
    }

    allOrders.sort((a, b) => {
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return (
        parseDateTimeMs(b.time, b.date) - parseDateTimeMs(a.time, a.date)
      );
    });

    setOrders(allOrders);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchAllOrders();
  }, [fetchAllOrders, user]);

  const strategyOptions = useMemo(() => {
    const names = new Set<string>();
    for (const o of orders) {
      if (o.strategyName) names.add(o.strategyName);
    }
    return Array.from(names).sort();
  }, [orders]);

  const accountOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const o of orders) {
      if (o.accountId) ids.add(o.accountId);
    }
    return Array.from(ids).sort();
  }, [orders]);

  const filtered = orders.filter((o) => {
    if (activeTab === "paper" && o.mode !== "PAPER") return false;
    if (activeTab === "live" && o.mode !== "LIVE") return false;
    if (statusFilter !== "ALL" && o.status !== statusFilter) return false;
    if (searchQuery && !o.symbol.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (strategyFilter !== "ALL" && (o.strategyName || "") !== strategyFilter) return false;
    if (accountFilter !== "ALL" && (o.accountId || "") !== accountFilter) return false;
    if (dateFrom || dateTo) {
      const ms = parseDateTimeMs(o.time, o.date);
      if (dateFrom) {
        const fromMs = Date.parse(`${dateFrom}T00:00:00+05:30`);
        if (!Number.isNaN(fromMs) && ms < fromMs) return false;
      }
      if (dateTo) {
        const toMs = Date.parse(`${dateTo}T23:59:59+05:30`);
        if (!Number.isNaN(toMs) && ms > toMs) return false;
      }
    }
    return true;
  });

  const hasActiveFilters =
    statusFilter !== "ALL" ||
    searchQuery.length > 0 ||
    strategyFilter !== "ALL" ||
    accountFilter !== "ALL" ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  function clearFilters() {
    setStatusFilter("ALL");
    setSearchQuery("");
    setStrategyFilter("ALL");
    setAccountFilter("ALL");
    setDateFrom("");
    setDateTo("");
  }

  const { sortKey, sortDir, toggleSort, sortRows } = useTableSort({
    key: "when",
    dir: "desc",
  });
  const sortedFiltered = useMemo(
    () =>
      sortRows(filtered, {
        when: (o) => parseDateTimeMs(o.time, o.date),
        symbol: (o) => o.symbol,
        side: (o) => o.side,
        type: (o) => o.type,
        qty: (o) => o.quantity,
        price: (o) => o.price,
        reason: (o) => o.reason ?? "",
        status: (o) => o.status,
        mode: (o) => o.mode,
        account: (o) => o.accountId ?? "",
      }),
    [filtered, sortRows]
  );

  const counts = {
    all: orders.length,
    paper: orders.filter((o) => o.mode === "PAPER").length,
    live: orders.filter((o) => o.mode === "LIVE").length,
  };

  function exportLive() {
    const live = orders.filter((o) => o.mode === "LIVE");
    if (live.length === 0) {
      toast.info("No live orders to export");
      return;
    }
    downloadLiveOrdersCsv(live);
    toast.success(`Exported ${live.length} live orders`);
  }

  function exportBlotter() {
    if (sortedFiltered.length === 0) {
      toast.info("Nothing to export for current filters");
      return;
    }
    downloadCombinedOrdersCsv(sortedFiltered);
    toast.success(`Exported ${sortedFiltered.length} orders`);
  }

  return (
    <div className="space-y-2 sm:space-y-2.5 p-2.5 sm:p-3 md:p-5">
      <PageHeader
        title="Orders"
        subtitle="Paper + live blotter"
        mode="neutral"
        padded={false}
        actions={
          <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
            <PaperExportMenu variant="compact" />
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Download className="h-3.5 w-3.5" />}
              onClick={exportLive}
              className="min-h-9"
            >
              Live CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Download className="h-3.5 w-3.5" />}
              onClick={exportBlotter}
              className="min-h-9"
            >
              Blotter
            </Button>
            <Button
              variant="secondary"
              size="sm"
              loading={isLoading}
              leftIcon={<RefreshCw className="h-4 w-4" />}
              onClick={() => void fetchAllOrders()}
              className="min-h-9"
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* Tabs — scrollable on mobile */}
      <div className="flex items-center gap-1 rounded-xl bg-bg-secondary p-1 border border-border w-full overflow-x-auto touch-pan-x">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 rounded-lg px-3 sm:px-4 py-2.5 min-h-11 text-sm font-medium transition-all whitespace-nowrap touch-manipulation ${
              activeTab === tab.key
                ? "bg-accent text-brand shadow-sm"
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

      {/* Filters — stacked for phones */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3">
        <div className="relative sm:col-span-2 xl:col-span-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search symbol..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full min-h-11 rounded-lg border border-border bg-bg-secondary py-2 pl-10 pr-4 text-sm text-text-primary placeholder-text-tertiary outline-none focus:border-accent"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary pointer-events-none" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OrderStatus | "ALL")}
            className="w-full appearance-none min-h-11 rounded-lg border border-border bg-bg-secondary py-2 pl-10 pr-8 text-sm text-text-primary outline-none focus:border-accent"
          >
            <option value="ALL">All status</option>
            <option value="EXECUTED">Executed</option>
            <option value="PENDING">Pending</option>
            <option value="OPEN">Open</option>
            <option value="REJECTED">Rejected</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        <select
          value={strategyFilter}
          onChange={(e) => setStrategyFilter(e.target.value)}
          className="w-full min-h-11 rounded-lg border border-border bg-bg-secondary px-3 text-sm text-text-primary outline-none focus:border-accent"
        >
          <option value="ALL">All strategies</option>
          {strategyOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className="w-full min-h-11 rounded-lg border border-border bg-bg-secondary px-3 text-sm text-text-primary outline-none focus:border-accent"
        >
          <option value="ALL">All accounts</option>
          {accountOptions.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-full min-h-11 rounded-lg border border-border bg-bg-secondary px-3 text-sm text-text-primary outline-none focus:border-accent"
          aria-label="From date"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-full min-h-11 rounded-lg border border-border bg-bg-secondary px-3 text-sm text-text-primary outline-none focus:border-accent"
          aria-label="To date"
        />
      </div>
      {hasActiveFilters && (
        <div className="flex justify-end -mt-1">
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      )}

      {/* Orders — mobile cards */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          <SkeletonTable rows={4} />
        ) : sortedFiltered.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={hasActiveFilters ? "No matching orders" : "No orders yet"}
            description={
              hasActiveFilters
                ? "Try clearing filters or widening the date range."
                : "Paper and live fills will show up here after your first trade."
            }
            action={
              hasActiveFilters ? (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button variant="paper" size="sm" onClick={() => (window.location.href = "/paper-trading")}>
                  Go to Paper Trading
                </Button>
              )
            }
          />
        ) : (
          sortedFiltered.map((order) => {
            const sc = statusConfig[order.status] || statusConfig.PENDING;
            const StatusIcon = sc.icon;
            return (
              <div
                key={order.id}
                className="rounded-xl border border-border bg-bg-secondary p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">
                      {order.symbol}{" "}
                      <span className="text-xs text-text-tertiary">{order.exchange}</span>
                    </p>
                    <p className="text-[10px] text-text-tertiary">
                      {formatDateTimeCompactIST(order.time, order.date)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-semibold ${
                      order.side === "BUY" ? "text-profit" : "text-loss"
                    }`}
                  >
                    {order.side}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${sc.color} ${sc.bg}`}>
                    <StatusIcon className="h-3 w-3" />
                    {sc.label}
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 font-semibold ${
                      order.mode === "LIVE"
                        ? "bg-loss/10 text-loss"
                        : "bg-accent/10 text-accent"
                    }`}
                  >
                    {order.mode}
                  </span>
                  <span className="text-text-secondary">{order.type}</span>
                </div>
                <div className="inline-flex items-center gap-3 text-xs text-text-secondary">
                  <span>
                    {order.quantity} @ {formatCurrency(order.price)}
                  </span>
                  <span className="font-medium text-text-primary tabular-nums">
                    {formatCurrency(order.price * order.quantity)}
                  </span>
                </div>
                {order.reason ? (
                  <p className="text-[11px] leading-snug text-text-tertiary break-words">
                    <span className="font-medium text-text-secondary">Reason: </span>
                    {order.reason}
                  </p>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {/* Orders Table — desktop */}
      <div className="hidden md:block rounded-lg border border-border bg-bg-secondary overflow-hidden p-1 sm:p-0">
        <DataTable
          aria-label="Orders"
          minWidthClass="min-w-[720px]"
          empty={!isLoading && sortedFiltered.length === 0}
          emptyIcon={ClipboardList}
          emptyTitle={hasActiveFilters ? "No matching orders" : "No orders yet"}
          emptyDescription={
            hasActiveFilters
              ? "Try clearing filters or widening the date range."
              : "Paper (simulated) and live (Zerodha) fills appear here after your first trade."
          }
          emptyAction={
            hasActiveFilters ? (
              <Button variant="secondary" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        >
          <thead>
            <tr className="border-b border-border">
              <SortableTh sortKey="when" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className={cn(tableDateTimeThClass, "px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-text-tertiary")}>When</SortableTh>
              <SortableTh sortKey="symbol" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Symbol</SortableTh>
              <SortableTh sortKey="side" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Side</SortableTh>
              <SortableTh sortKey="type" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Type</SortableTh>
              <SortableTh sortKey="qty" activeKey={sortKey} direction={sortDir} onSort={toggleSort} align="right" className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Qty</SortableTh>
              <SortableTh sortKey="price" activeKey={sortKey} direction={sortDir} onSort={toggleSort} align="right" className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Price</SortableTh>
              <SortableTh sortKey="reason" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-text-tertiary min-w-[12rem] max-w-[20rem]">Reason</SortableTh>
              <SortableTh sortKey="status" activeKey={sortKey} direction={sortDir} onSort={toggleSort} align="center" className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Status</SortableTh>
              <SortableTh sortKey="mode" activeKey={sortKey} direction={sortDir} onSort={toggleSort} align="center" className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Mode</SortableTh>
              <SortableTh sortKey="account" activeKey={sortKey} direction={sortDir} onSort={toggleSort} align="center" className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Account</SortableTh>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={10} className="px-4 py-4">
                  <SkeletonTable rows={6} />
                </td>
              </tr>
            ) : (
              sortedFiltered.map((order) => {
                const sc = statusConfig[order.status] || statusConfig.PENDING;
                const StatusIcon = sc.icon;
                return (
                  <tr key={order.id} className="transition-colors hover:bg-bg-hover/50">
                    <td
                      className={cn(tableDateTimeTdClass, "px-4 py-3")}
                      title={formatDateTimeIST(order.time, order.date)}
                    >
                      {formatDateTimeCompactIST(order.time, order.date)}
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
                    <td className="px-4 py-3 max-w-[20rem]">
                      {order.reason ? (
                        <p
                          className="text-xs leading-snug text-text-secondary break-words"
                          title={order.reason}
                        >
                          {order.reason}
                        </p>
                      ) : (
                        <span className="text-xs text-text-tertiary">—</span>
                      )}
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
        </DataTable>
      </div>

      {/* Footer Summary */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-tertiary">
        <span>Showing {sortedFiltered.length} of {orders.length} orders</span>
        <span>
          Total value: {formatCurrency(
            sortedFiltered
              .filter((o) => o.status === "EXECUTED" || o.status === "COMPLETE")
              .reduce((sum, o) => sum + o.price * o.quantity, 0)
          )}
        </span>
      </div>
    </div>
  );
}
