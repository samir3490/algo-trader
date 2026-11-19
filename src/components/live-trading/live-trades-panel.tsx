"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Loader2,
  XCircle,
} from "lucide-react";
import {
  cn,
  formatCurrency,
  formatNumber,
  tableDateTimeThClass,
  tableDateTimeTdClass,
} from "@/lib/utils";
import type { EnrichedPaperTrade } from "@/lib/strategies/strategy-performance";
import {
  formatTradeDateTime,
  formatTradeDateTimeCompact,
  tradeExecutedAtMs,
} from "@/lib/paper-trades/normalize";
import {
  attachFifoNetPnl,
  computeTradePeriodTotals,
  filterTradesByDateRange,
  resolveTradeDateRange,
  tradePeriodLabel,
  type TradePeriodPreset,
} from "@/lib/portfolio/trade-period";
import {
  resolveTradeCharges,
  formatChargesTooltip,
  chargeOtherFees,
  formatOtherFeesTooltip,
} from "@/lib/brokerage/trade-charges";
import StrategyBadges from "@/components/strategy-badges";
import PaginationBar, {
  DEFAULT_PAGE_SIZE,
  paginateItems,
} from "@/components/ui/pagination-bar";
import { useTableSort } from "@/hooks/use-table-sort";
import SortableTh from "@/components/ui/sortable-th";

export interface LiveTradeRow extends EnrichedPaperTrade {
  orderId?: string;
  status?: string;
  orderType?: string;
  fromHistory?: boolean;
  cancellable?: boolean;
}

export default function LiveTradesPanel({
  trades,
  openOrders,
  cancellingOrderId,
  onCancelOrder,
}: {
  trades: LiveTradeRow[];
  /** Open/pending live orders shown below filled history. */
  openOrders?: Array<{
    orderId: string;
    time: string;
    symbol: string;
    type: string;
    side: string;
    qty: number;
    price: number;
    status: string;
    fromHistory?: boolean;
    strategyName?: string;
  }>;
  cancellingOrderId?: string | null;
  onCancelOrder?: (order: { orderId: string }) => void;
}) {
  const [tradePeriod, setTradePeriod] = useState<TradePeriodPreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [tradesPage, setTradesPage] = useState(1);

  const enrichedTrades = useMemo(() => attachFifoNetPnl(trades), [trades]);

  const tradeDateRange = useMemo(
    () =>
      resolveTradeDateRange(tradePeriod, new Date(), {
        from: customFrom,
        to: customTo,
      }),
    [tradePeriod, customFrom, customTo]
  );
  const periodFilteredTrades = useMemo(
    () => filterTradesByDateRange(enrichedTrades, tradeDateRange),
    [enrichedTrades, tradeDateRange]
  );
  const periodTotals = useMemo(
    () => computeTradePeriodTotals(enrichedTrades, tradeDateRange),
    [enrichedTrades, tradeDateRange]
  );
  const periodLabel = tradePeriodLabel(tradePeriod, tradeDateRange);

  const strategyTradeCount = useMemo(
    () =>
      enrichedTrades.filter((t) => t.displayStrategyName !== "Manual").length,
    [enrichedTrades]
  );

  const tradesSort = useTableSort({ key: "when", dir: "desc" });
  const sortedEnrichedTrades = useMemo(
    () =>
      tradesSort.sortRows(periodFilteredTrades, {
        when: (t) => tradeExecutedAtMs(t),
        symbol: (t) => t.symbol,
        strategy: (t) => t.displayStrategyName ?? "",
        side: (t) => t.side,
        qty: (t) => t.qty,
        price: (t) => t.price,
        total: (t) => t.qty * t.price,
        netPnl: (t) => t.netPnl ?? 0,
      }),
    [periodFilteredTrades, tradesSort.sortRows]
  );

  useEffect(() => {
    setTradesPage(1);
  }, [
    tradePeriod,
    customFrom,
    customTo,
    tradesSort.sortKey,
    tradesSort.sortDir,
    trades.length,
  ]);

  const tradesPagination = useMemo(
    () => paginateItems(sortedEnrichedTrades, tradesPage, DEFAULT_PAGE_SIZE),
    [sortedEnrichedTrades, tradesPage]
  );
  const paged = tradesPagination.pageItems;
  const open = (openOrders ?? []).filter(
    (o) =>
      !o.fromHistory &&
      ["PENDING", "OPEN", "TRIGGER PENDING"].includes(
        (o.status || "").toUpperCase()
      )
  );

  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-text-primary">
          Trade History
          {enrichedTrades.length > 0 && (
            <span className="ml-2 text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">
              {periodFilteredTrades.length}
              {tradePeriod !== "all" ? ` / ${enrichedTrades.length}` : ""}
            </span>
          )}
        </h2>
        <div className="text-xs text-text-tertiary sm:text-right sm:max-w-md">
          {strategyTradeCount > 0 && (
            <span>
              {strategyTradeCount} strategy trade
              {strategyTradeCount !== 1 ? "s" : ""}
              {" · "}
            </span>
          )}
          Today from Zerodha · prior days from AlgoTrader live history
          <span className="block mt-1 text-text-tertiary/90">
            Fees estimated from Zerodha schedule (same columns as Paper).
          </span>
        </div>
      </div>

      {enrichedTrades.length > 0 && (
        <div className="mb-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div
              className="flex flex-wrap items-center gap-1 rounded-lg bg-bg-tertiary p-1"
              role="tablist"
              aria-label="Trade history period"
            >
              {(
                [
                  ["week", "Week"],
                  ["month", "Month"],
                  ["year", "Year"],
                  ["all", "All"],
                  ["custom", "Custom"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tradePeriod === value}
                  onClick={() => {
                    setTradePeriod(value);
                    setTradesPage(1);
                  }}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                    tradePeriod === value
                      ? "bg-bg-elevated text-text-primary shadow-sm"
                      : "text-text-secondary hover:text-text-primary"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-text-tertiary">{periodLabel}</p>
          </div>

          {tradePeriod === "custom" && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-text-tertiary">
                From
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-sm text-text-primary"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-tertiary">
                To
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-sm text-text-primary"
                />
              </label>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-lg border border-border/60 bg-bg-secondary/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-text-tertiary">
                Trades
              </p>
              <p className="text-sm font-semibold tabular-nums text-text-primary">
                {periodTotals.tradeCount}
              </p>
              <p className="text-[11px] text-text-tertiary">
                {periodTotals.buyCount} buy · {periodTotals.sellCount} sell
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-bg-secondary/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-text-tertiary">
                Buy amount
              </p>
              <p className="text-sm font-semibold tabular-nums text-text-primary">
                {formatCurrency(periodTotals.buyTurnover)}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-bg-secondary/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-text-tertiary">
                Sell amount
              </p>
              <p className="text-sm font-semibold tabular-nums text-text-primary">
                {formatCurrency(periodTotals.sellTurnover)}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-bg-secondary/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-text-tertiary">
                Total traded
              </p>
              <p className="text-sm font-semibold tabular-nums text-text-primary">
                {formatCurrency(periodTotals.totalTurnover)}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-bg-secondary/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-text-tertiary">
                Realized P&amp;L
              </p>
              <p
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  periodTotals.realizedPnl >= 0 ? "text-profit" : "text-loss"
                )}
              >
                {periodTotals.realizedPnl >= 0 ? "+" : ""}
                {formatCurrency(periodTotals.realizedPnl)}
              </p>
              <p className="text-[11px] text-text-tertiary">
                {periodTotals.wins}W / {periodTotals.losses}L
                {periodTotals.winRate > 0 ? ` · ${periodTotals.winRate}%` : ""}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-bg-secondary/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-text-tertiary">
                Fees
              </p>
              <p className="text-sm font-semibold tabular-nums text-text-primary">
                {formatCurrency(periodTotals.fees)}
              </p>
              {periodTotals.feesEstimated && (
                <p className="text-[11px] text-text-tertiary">
                  est. Zerodha schedule
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {enrichedTrades.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-text-tertiary">
          <Clock className="h-10 w-10 mb-3 text-text-tertiary" />
          <p className="text-sm">No live trades yet.</p>
          <p className="text-xs mt-1">
            Today&apos;s Zerodha fills and saved live history will appear here.
          </p>
        </div>
      ) : periodFilteredTrades.length === 0 ? (
        <div className="py-12 text-center text-text-tertiary">
          No trades in {periodLabel.toLowerCase()}.
        </div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {paged.map((t) => {
              const isBuy = t.side === "BUY";
              const isManual =
                t.displayStrategyName === "Manual" &&
                !t.id?.startsWith("strat-");
              const charges = resolveTradeCharges(t);
              return (
                <div
                  key={`mobile-live-${t.id}`}
                  className={cn(
                    "rounded-lg border p-4 space-y-2",
                    isBuy
                      ? "border-profit/20 bg-profit/[0.03]"
                      : "border-loss/20 bg-loss/[0.03]"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-text-primary">
                        {t.symbol}
                      </p>
                      <p className="text-[10px] text-text-tertiary">
                        {formatTradeDateTimeCompact(t)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold shrink-0",
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
                  </div>
                  <div className="text-sm text-text-secondary tabular-nums break-words">
                    {formatNumber(t.qty)} × {formatCurrency(t.price)} ={" "}
                    <span className="font-medium text-text-primary">
                      {formatCurrency(t.qty * t.price)}
                    </span>
                  </div>
                  <StrategyBadges
                    names={t.displayStrategyNames}
                    unknownCount={t.unknownStrategyCount}
                    manual={isManual}
                    size="sm"
                  />
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
                    <span className="text-text-tertiary">
                      Fees {formatCurrency(charges.total)}
                      {charges.estimated && " (est.)"}
                    </span>
                    {!isBuy && t.netPnl != null ? (
                      <span
                        className={cn(
                          "font-semibold",
                          t.netPnl >= 0 ? "text-profit" : "text-loss"
                        )}
                      >
                        Net {formatCurrency(t.netPnl)}
                      </span>
                    ) : (
                      <span className="text-text-tertiary">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hidden md:block overflow-x-auto -mx-5">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-border">
                  <SortableTh
                    sortKey="when"
                    activeKey={tradesSort.sortKey}
                    direction={tradesSort.sortDir}
                    onSort={tradesSort.toggleSort}
                    className={cn(
                      tableDateTimeThClass,
                      "text-xs text-text-tertiary uppercase tracking-wider py-3 pl-5 pr-1"
                    )}
                  >
                    When
                  </SortableTh>
                  <SortableTh
                    sortKey="symbol"
                    activeKey={tradesSort.sortKey}
                    direction={tradesSort.sortDir}
                    onSort={tradesSort.toggleSort}
                    className="text-xs text-text-tertiary uppercase tracking-wider py-3 px-5"
                  >
                    Symbol
                  </SortableTh>
                  <SortableTh
                    sortKey="strategy"
                    activeKey={tradesSort.sortKey}
                    direction={tradesSort.sortDir}
                    onSort={tradesSort.toggleSort}
                    className="text-xs text-text-tertiary uppercase tracking-wider py-3 px-5"
                  >
                    Strategy
                  </SortableTh>
                  <SortableTh
                    sortKey="side"
                    activeKey={tradesSort.sortKey}
                    direction={tradesSort.sortDir}
                    onSort={tradesSort.toggleSort}
                    className="text-xs text-text-tertiary uppercase tracking-wider py-3 px-5"
                  >
                    Side
                  </SortableTh>
                  <SortableTh
                    sortKey="qty"
                    activeKey={tradesSort.sortKey}
                    direction={tradesSort.sortDir}
                    onSort={tradesSort.toggleSort}
                    align="right"
                    className="text-xs text-text-tertiary uppercase tracking-wider py-3 px-5"
                  >
                    Qty
                  </SortableTh>
                  <SortableTh
                    sortKey="price"
                    activeKey={tradesSort.sortKey}
                    direction={tradesSort.sortDir}
                    onSort={tradesSort.toggleSort}
                    align="right"
                    className="text-xs text-text-tertiary uppercase tracking-wider py-3 px-5"
                  >
                    Price
                  </SortableTh>
                  <SortableTh
                    sortKey="total"
                    activeKey={tradesSort.sortKey}
                    direction={tradesSort.sortDir}
                    onSort={tradesSort.toggleSort}
                    align="right"
                    className="text-xs text-text-tertiary uppercase tracking-wider py-3 px-5"
                  >
                    Total
                  </SortableTh>
                  <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-3">
                    Brokerage
                  </th>
                  <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-3">
                    STT
                  </th>
                  <th className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-3">
                    GST
                  </th>
                  <th
                    className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-3"
                    title="Exchange transaction charge + SEBI fees + stamp duty"
                  >
                    Other
                  </th>
                  <th
                    className="text-right text-xs text-text-tertiary uppercase tracking-wider py-3 px-3"
                    title="Brokerage + STT + GST + Other"
                  >
                    Total fees
                  </th>
                  <SortableTh
                    sortKey="netPnl"
                    activeKey={tradesSort.sortKey}
                    direction={tradesSort.sortDir}
                    onSort={tradesSort.toggleSort}
                    align="right"
                    className="text-xs text-text-tertiary uppercase tracking-wider py-3 px-5"
                  >
                    Net P&amp;L
                  </SortableTh>
                </tr>
              </thead>
              <tbody>
                {paged.map((t) => {
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
                      <td
                        className={cn(tableDateTimeTdClass, "py-3 pl-5 pr-1")}
                        title={formatTradeDateTime(t)}
                      >
                        {formatTradeDateTimeCompact(t)}
                        {t.fromHistory && (
                          <span className="block text-[9px] uppercase tracking-wide text-text-tertiary">
                            History
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-5 font-medium text-text-primary">
                        {t.symbol}
                        <span className="text-text-tertiary text-xs ml-1">
                          {t.exchange}
                        </span>
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
                        title={formatOtherFeesTooltip(charges)}
                      >
                        {formatCurrency(chargeOtherFees(charges))}
                      </td>
                      <td
                        className="py-3 px-3 text-right text-text-tertiary text-xs tabular-nums font-medium"
                        title={formatChargesTooltip(charges)}
                      >
                        {formatCurrency(charges.total)}
                        {charges.estimated && (
                          <span className="block text-[10px] text-text-tertiary/80">
                            est.
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-5 text-right font-semibold">
                        {!isBuy && t.netPnl != null ? (
                          <span
                            className={
                              t.netPnl >= 0 ? "text-profit" : "text-loss"
                            }
                          >
                            {t.netPnl >= 0 ? "+" : ""}
                            {formatCurrency(t.netPnl)}
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
          <PaginationBar
            page={tradesPagination.safePage}
            totalPages={tradesPagination.totalPages}
            totalItems={sortedEnrichedTrades.length}
            onPageChange={setTradesPage}
          />
        </>
      )}

      {open.length > 0 && (
        <div className="mt-6 pt-4 border-t border-border">
          <h3 className="text-sm font-semibold text-text-primary mb-2">
            Open / pending orders
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-secondary text-xs border-b border-border">
                  <th className="text-left py-2 px-3 font-medium">Symbol</th>
                  <th className="text-left py-2 px-3 font-medium">Side</th>
                  <th className="text-right py-2 px-3 font-medium">Qty</th>
                  <th className="text-right py-2 px-3 font-medium">Status</th>
                  <th className="text-right py-2 px-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {open.map((order) => (
                  <tr
                    key={order.orderId}
                    className="border-b border-border/50"
                  >
                    <td className="py-2 px-3 font-medium">{order.symbol}</td>
                    <td className="py-2 px-3">
                      <span
                        className={
                          order.side === "BUY"
                            ? "text-profit text-xs font-semibold"
                            : "text-loss text-xs font-semibold"
                        }
                      >
                        {order.side}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">{order.qty}</td>
                    <td className="py-2 px-3 text-right text-xs">{order.status}</td>
                    <td className="py-2 px-3 text-right">
                      {onCancelOrder && (
                        <button
                          type="button"
                          onClick={() => onCancelOrder(order)}
                          disabled={cancellingOrderId === order.orderId}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-red-400 hover:text-red-300 bg-red-900/20 hover:bg-red-900/40 px-2 py-1 rounded transition-colors disabled:opacity-50"
                        >
                          {cancellingOrderId === order.orderId ? (
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
        </div>
      )}
    </div>
  );
}
