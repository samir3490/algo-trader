"use client";

import { Fragment, useMemo, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  Plus as PlusIcon,
} from "lucide-react";
import {
  cn,
  formatCurrency,
  formatNumber,
} from "@/lib/utils";
import type { StrategyDetailBundle } from "@/lib/strategies/strategy-performance";
import StrategyBadges from "@/components/strategy-badges";
import SymbolEventsTable from "@/components/strategy-performance/symbol-events-table";
import { useTableSort } from "@/hooks/use-table-sort";
import SortableTh from "@/components/ui/sortable-th";

export default function LiveStrategyPerformancePanel({
  bundles,
  onPlaceOrder,
}: {
  bundles: StrategyDetailBundle[];
  onPlaceOrder?: () => void;
}) {
  const [expandedStrategyKey, setExpandedStrategyKey] = useState<string | null>(
    null
  );
  const strategySort = useTableSort({ key: "pnl", dir: "desc" });
  const sorted = useMemo(
    () =>
      strategySort.sortRows(bundles, {
        strategy: (b) => b.summary.strategyName,
        trades: (b) => b.summary.trades,
        stocks: (b) => b.symbols.length,
        closed: (b) => b.summary.closedRounds,
        wins: (b) => b.summary.wins,
        winRate: (b) => b.summary.winRate,
        avgHold: (b) => b.summary.avgHoldDays,
        pnl: (b) => b.summary.realizedPnl,
      }),
    [bundles, strategySort.sortRows]
  );

  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">
            Strategy performance
          </h2>
        </div>
        {onPlaceOrder && (
          <button
            type="button"
            onClick={onPlaceOrder}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Place Order
          </button>
        )}
      </div>
      {sorted.length === 0 ? (
        <div className="py-12 text-center text-sm text-text-tertiary">
          No strategy trades yet. Enable live auto-trading and reconnect Zerodha
          so algo fills are recorded with strategy names.
        </div>
      ) : (
        <>
          <p className="text-xs text-text-tertiary mb-4">
            Tap a strategy to see each share — buy/sell dates, amounts, and
            P&amp;L per stock.
          </p>
          <div className="md:hidden space-y-2">
            {sorted.map((bundle) => {
              const s = bundle.summary;
              const isOpen = expandedStrategyKey === bundle.key;
              const stockCount = bundle.symbols.length;
              return (
                <div
                  key={`mobile-${bundle.key}`}
                  className="rounded-lg border border-border overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedStrategyKey(isOpen ? null : bundle.key)
                    }
                    className={cn(
                      "w-full text-left px-4 py-3 transition-colors",
                      isOpen ? "bg-accent/5" : "hover:bg-bg-hover/50"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <StrategyBadges names={[s.strategyName]} size="sm" />
                      <span
                        className={cn(
                          "text-sm font-semibold shrink-0",
                          s.realizedPnl >= 0 ? "text-profit" : "text-loss"
                        )}
                      >
                        {s.realizedPnl >= 0 ? "+" : ""}
                        {formatCurrency(s.realizedPnl)}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-tertiary">
                      <span>
                        {s.trades} trades · {stockCount} stocks
                      </span>
                      <span className="text-right">{s.closedRounds} closed</span>
                      <span>
                        W/L {s.wins}/{s.losses}
                      </span>
                      <span className="text-right">
                        {s.winRate > 0 ? `${s.winRate}% win` : "—"}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-1 text-[10px] text-text-tertiary uppercase tracking-wide">
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      {isOpen ? "Hide details" : "Show per-stock details"}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-border/50 px-4 py-3 bg-bg-secondary/30 space-y-3">
                      {bundle.symbols.length === 0 ? (
                        <p className="text-sm text-text-tertiary">
                          No trades recorded.
                        </p>
                      ) : (
                        bundle.symbols.map((sym) => {
                          const totalPnl = sym.realizedPnl + sym.unrealizedPnl;
                          return (
                            <div
                              key={`${sym.symbol}-${sym.exchange}`}
                              className="rounded-lg border border-border/60 overflow-hidden"
                            >
                              <div className="px-3 py-2 bg-bg-primary/50 border-b border-border/50">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-semibold text-sm text-text-primary">
                                    {sym.symbol}
                                  </span>
                                  <span
                                    className={cn(
                                      "text-xs font-medium",
                                      totalPnl >= 0 ? "text-profit" : "text-loss"
                                    )}
                                  >
                                    {totalPnl >= 0 ? "+" : ""}
                                    {formatCurrency(totalPnl)}
                                  </span>
                                </div>
                              </div>
                              <SymbolEventsTable events={sym.events} />
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="hidden md:block overflow-x-auto -mx-5">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs text-text-tertiary uppercase tracking-wider py-3 px-5 w-8" />
                  <SortableTh
                    sortKey="strategy"
                    activeKey={strategySort.sortKey}
                    direction={strategySort.sortDir}
                    onSort={strategySort.toggleSort}
                    className="text-xs text-text-tertiary uppercase tracking-wider py-3 px-5"
                  >
                    Strategy
                  </SortableTh>
                  <SortableTh
                    sortKey="trades"
                    activeKey={strategySort.sortKey}
                    direction={strategySort.sortDir}
                    onSort={strategySort.toggleSort}
                    align="right"
                    className="text-xs text-text-tertiary uppercase tracking-wider py-3 px-5"
                  >
                    Trades
                  </SortableTh>
                  <SortableTh
                    sortKey="stocks"
                    activeKey={strategySort.sortKey}
                    direction={strategySort.sortDir}
                    onSort={strategySort.toggleSort}
                    align="right"
                    className="text-xs text-text-tertiary uppercase tracking-wider py-3 px-5"
                  >
                    Stocks
                  </SortableTh>
                  <SortableTh
                    sortKey="closed"
                    activeKey={strategySort.sortKey}
                    direction={strategySort.sortDir}
                    onSort={strategySort.toggleSort}
                    align="right"
                    className="text-xs text-text-tertiary uppercase tracking-wider py-3 px-5"
                  >
                    Closed
                  </SortableTh>
                  <SortableTh
                    sortKey="wins"
                    activeKey={strategySort.sortKey}
                    direction={strategySort.sortDir}
                    onSort={strategySort.toggleSort}
                    align="right"
                    className="text-xs text-text-tertiary uppercase tracking-wider py-3 px-5"
                  >
                    Win / Loss
                  </SortableTh>
                  <SortableTh
                    sortKey="winRate"
                    activeKey={strategySort.sortKey}
                    direction={strategySort.sortDir}
                    onSort={strategySort.toggleSort}
                    align="right"
                    className="text-xs text-text-tertiary uppercase tracking-wider py-3 px-5"
                  >
                    Win %
                  </SortableTh>
                  <SortableTh
                    sortKey="avgHold"
                    activeKey={strategySort.sortKey}
                    direction={strategySort.sortDir}
                    onSort={strategySort.toggleSort}
                    align="right"
                    className="text-xs text-text-tertiary uppercase tracking-wider py-3 px-5"
                  >
                    Avg hold
                  </SortableTh>
                  <SortableTh
                    sortKey="pnl"
                    activeKey={strategySort.sortKey}
                    direction={strategySort.sortDir}
                    onSort={strategySort.toggleSort}
                    align="right"
                    className="text-xs text-text-tertiary uppercase tracking-wider py-3 px-5"
                  >
                    Realized P&amp;L
                  </SortableTh>
                </tr>
              </thead>
              <tbody>
                {sorted.map((bundle) => {
                  const s = bundle.summary;
                  const isOpen = expandedStrategyKey === bundle.key;
                  const stockCount = bundle.symbols.length;
                  return (
                    <Fragment key={bundle.key}>
                      <tr
                        onClick={() =>
                          setExpandedStrategyKey(isOpen ? null : bundle.key)
                        }
                        className={cn(
                          "border-b border-border/50 cursor-pointer transition-colors",
                          isOpen ? "bg-accent/5" : "hover:bg-bg-secondary/60"
                        )}
                      >
                        <td className="py-3 px-5 text-text-tertiary">
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </td>
                        <td className="py-3 px-5 font-medium text-text-primary">
                          <StrategyBadges names={[s.strategyName]} size="sm" />
                        </td>
                        <td className="py-3 px-5 text-right text-text-secondary">
                          {s.trades}
                        </td>
                        <td className="py-3 px-5 text-right text-text-secondary">
                          {stockCount}
                        </td>
                        <td className="py-3 px-5 text-right text-text-secondary">
                          {s.closedRounds}
                        </td>
                        <td className="py-3 px-5 text-right text-text-secondary">
                          <span className="text-profit">{s.wins}</span>
                          {" / "}
                          <span className="text-loss">{s.losses}</span>
                        </td>
                        <td className="py-3 px-5 text-right text-text-secondary">
                          {s.winRate > 0 ? `${s.winRate}%` : "—"}
                        </td>
                        <td className="py-3 px-5 text-right text-text-secondary">
                          {s.avgHoldDays > 0 ? `${s.avgHoldDays}d` : "—"}
                        </td>
                        <td
                          className={cn(
                            "py-3 px-5 text-right font-semibold",
                            s.realizedPnl >= 0 ? "text-profit" : "text-loss"
                          )}
                        >
                          {s.realizedPnl >= 0 ? "+" : ""}
                          {formatCurrency(s.realizedPnl)}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr
                          key={`${bundle.key}-detail`}
                          className="border-b border-border/50 bg-bg-secondary/30"
                        >
                          <td colSpan={9} className="py-4 px-5">
                            {bundle.symbols.length === 0 ? (
                              <p className="text-sm text-text-tertiary">
                                No trades recorded for this strategy.
                              </p>
                            ) : (
                              <div className="space-y-4">
                                {bundle.symbols.map((sym) => {
                                  const totalPnl =
                                    sym.realizedPnl + sym.unrealizedPnl;
                                  return (
                                    <div
                                      key={`${sym.symbol}-${sym.exchange}`}
                                      className="rounded-lg border border-border/60 overflow-hidden"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-bg-primary/50 border-b border-border/50">
                                        <div className="flex items-center gap-2">
                                          <span className="font-semibold text-text-primary">
                                            {sym.symbol}
                                          </span>
                                          <span className="text-xs text-text-tertiary">
                                            {sym.exchange}
                                          </span>
                                          <span
                                            className={cn(
                                              "text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-medium",
                                              sym.status === "open"
                                                ? "bg-amber-500/15 text-amber-400"
                                                : "bg-border/50 text-text-tertiary"
                                            )}
                                          >
                                            {sym.status === "open"
                                              ? "Open"
                                              : "Closed"}
                                          </span>
                                        </div>
                                        <div className="flex flex-wrap gap-4 text-xs">
                                          <span className="text-text-tertiary">
                                            Realized:{" "}
                                            <span
                                              className={
                                                sym.realizedPnl >= 0
                                                  ? "text-profit font-medium"
                                                  : "text-loss font-medium"
                                              }
                                            >
                                              {sym.realizedPnl >= 0 ? "+" : ""}
                                              {formatCurrency(sym.realizedPnl)}
                                            </span>
                                          </span>
                                          {sym.openQty > 0 && (
                                            <span className="text-text-tertiary">
                                              Open {formatNumber(sym.openQty)} @{" "}
                                              {formatCurrency(sym.openAvgCost)}
                                              {" · "}
                                              Unrealized:{" "}
                                              <span
                                                className={
                                                  sym.unrealizedPnl >= 0
                                                    ? "text-profit font-medium"
                                                    : "text-loss font-medium"
                                                }
                                              >
                                                {sym.unrealizedPnl >= 0
                                                  ? "+"
                                                  : ""}
                                                {formatCurrency(
                                                  sym.unrealizedPnl
                                                )}
                                              </span>
                                            </span>
                                          )}
                                          <span className="text-text-secondary font-medium">
                                            Total:{" "}
                                            <span
                                              className={
                                                totalPnl >= 0
                                                  ? "text-profit"
                                                  : "text-loss"
                                              }
                                            >
                                              {totalPnl >= 0 ? "+" : ""}
                                              {formatCurrency(totalPnl)}
                                            </span>
                                          </span>
                                        </div>
                                      </div>
                                      <SymbolEventsTable events={sym.events} />
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
