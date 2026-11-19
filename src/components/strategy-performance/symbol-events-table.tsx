"use client";

import { useMemo } from "react";
import { cn, formatCurrency, formatNumber, tableDateTimeThClass, tableDateTimeTdClass } from "@/lib/utils";
import type { StrategyTradeEvent } from "@/lib/strategies/strategy-performance";
import StrategyBadges from "@/components/strategy-badges";
import { useTableSort } from "@/hooks/use-table-sort";
import SortableTh from "@/components/ui/sortable-th";

export default function SymbolEventsTable({
  events,
}: {
  events: StrategyTradeEvent[];
}) {
  const { sortKey, sortDir, toggleSort, sortRows } = useTableSort({
    key: "when",
    dir: "desc",
  });
  const sorted = useMemo(
    () =>
      sortRows(events, {
        when: (e) => e.executedAtMs,
        strategy: (e) => e.strategyNames?.[0] ?? "",
        side: (e) => e.side,
        qty: (e) => e.qty,
        price: (e) => e.price,
        total: (e) => e.total,
        pnl: (e) => e.realizedPnl ?? 0,
      }),
    [events, sortRows]
  );

  if (sorted.length === 0) {
    return <p className="px-4 py-2 text-xs text-text-tertiary">No events.</p>;
  }

  return (
    <>
      <div className="md:hidden divide-y divide-border/40">
        {sorted.map((ev) => {
          const isBuy = ev.side === "BUY";
          return (
            <div key={ev.tradeId} className="px-3 py-2.5 space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-text-tertiary">{ev.dateTimeLabel}</span>
                <span
                  className={cn(
                    "inline-flex px-1.5 py-0.5 rounded font-semibold",
                    isBuy ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss"
                  )}
                >
                  {ev.side}
                </span>
              </div>
              <div className="flex justify-between tabular-nums">
                <span className="text-text-secondary">
                  {formatNumber(ev.qty)} @ {formatCurrency(ev.price)}
                </span>
                <span className="text-text-primary font-medium">
                  {formatCurrency(ev.total)}
                </span>
              </div>
              {ev.side === "SELL" && ev.realizedPnl != null && (
                <p
                  className={cn(
                    "text-right font-medium",
                    ev.realizedPnl >= 0 ? "text-profit" : "text-loss"
                  )}
                >
                  P&amp;L {ev.realizedPnl >= 0 ? "+" : ""}
                  {formatCurrency(ev.realizedPnl)}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <table className="hidden md:table w-full text-xs">
        <thead>
          <tr className="text-text-tertiary uppercase tracking-wider border-b border-border/40">
            <SortableTh
              sortKey="when"
              activeKey={sortKey}
              direction={sortDir}
              onSort={toggleSort}
              className={cn(tableDateTimeThClass, "py-2 px-4 font-medium")}
            >
              When
            </SortableTh>
            <SortableTh
              sortKey="strategy"
              activeKey={sortKey}
              direction={sortDir}
              onSort={toggleSort}
              className="py-2 px-4 font-medium"
            >
              Strategies
            </SortableTh>
            <SortableTh
              sortKey="side"
              activeKey={sortKey}
              direction={sortDir}
              onSort={toggleSort}
              className="py-2 px-4 font-medium"
            >
              Side
            </SortableTh>
            <SortableTh
              sortKey="qty"
              activeKey={sortKey}
              direction={sortDir}
              onSort={toggleSort}
              align="right"
              className="py-2 px-4 font-medium"
            >
              Qty
            </SortableTh>
            <SortableTh
              sortKey="price"
              activeKey={sortKey}
              direction={sortDir}
              onSort={toggleSort}
              align="right"
              className="py-2 px-4 font-medium"
            >
              Price
            </SortableTh>
            <SortableTh
              sortKey="total"
              activeKey={sortKey}
              direction={sortDir}
              onSort={toggleSort}
              align="right"
              className="py-2 px-4 font-medium"
            >
              Amount
            </SortableTh>
            <SortableTh
              sortKey="pnl"
              activeKey={sortKey}
              direction={sortDir}
              onSort={toggleSort}
              align="right"
              className="py-2 px-4 font-medium"
            >
              P&amp;L
            </SortableTh>
          </tr>
        </thead>
        <tbody>
          {sorted.map((ev) => {
            const isBuy = ev.side === "BUY";
            return (
              <tr
                key={ev.tradeId}
                className="border-b border-border/30 last:border-0"
              >
                <td
                  className={cn(tableDateTimeTdClass, "py-2 px-4")}
                  title={ev.dateTimeTitle ?? ev.dateTimeLabel}
                >
                  {ev.dateTimeLabel}
                </td>
                <td className="py-2 px-4">
                  {ev.strategyNames && ev.strategyNames.length > 0 ? (
                    <StrategyBadges
                      names={ev.strategyNames}
                      unknownCount={ev.unknownStrategyCount}
                      size="sm"
                    />
                  ) : (
                    <span className="text-text-tertiary">—</span>
                  )}
                </td>
                <td className="py-2 px-4">
                  <span
                    className={cn(
                      "inline-flex px-1.5 py-0.5 rounded font-semibold",
                      isBuy ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss"
                    )}
                  >
                    {ev.side}
                  </span>
                </td>
                <td className="py-2 px-4 text-right text-text-secondary">
                  {formatNumber(ev.qty)}
                </td>
                <td className="py-2 px-4 text-right text-text-primary">
                  {formatCurrency(ev.price)}
                </td>
                <td className="py-2 px-4 text-right text-text-primary">
                  {formatCurrency(ev.total)}
                </td>
                <td className="py-2 px-4 text-right font-medium">
                  {ev.side === "SELL" && ev.realizedPnl != null ? (
                    <span
                      className={
                        ev.realizedPnl >= 0 ? "text-profit" : "text-loss"
                      }
                    >
                      {ev.realizedPnl >= 0 ? "+" : ""}
                      {formatCurrency(ev.realizedPnl)}
                      {ev.matchedBuyPrice != null && (
                        <span className="block text-[10px] text-text-tertiary font-normal">
                          vs {formatCurrency(ev.matchedBuyPrice)}
                        </span>
                      )}
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
    </>
  );
}
