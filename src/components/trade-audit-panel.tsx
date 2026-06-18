"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Download, RefreshCw } from "lucide-react";
import {
  cn,
  formatCurrency,
  formatDateTimeCompactIST,
  formatDateTimeIST,
  tableDateTimeTdClass,
  tableDateTimeThClass,
} from "@/lib/utils";
import { buildTradeAuditLog } from "@/lib/portfolio/trade-audit";
import { useTableSort } from "@/hooks/use-table-sort";
import SortableTh from "@/components/ui/sortable-th";
import { buildTradeAuditCsv } from "@/lib/export/trade-audit-export";
import { downloadCsv, exportDateStamp } from "@/lib/export/csv";
import { getPaperTradingState } from "@/lib/firebase";
import type { PaperTrade } from "@/lib/firebase";
import type { TradeAuditEntry } from "@/lib/portfolio/types";

function formatAuditWhen(r: TradeAuditEntry): string {
  const raw = r.executedAt ?? (r.side === "SELL" ? r.exitTime : r.entryTime);
  if (!raw) return "—";
  return formatDateTimeCompactIST(raw);
}

function AuditCard({ r }: { r: TradeAuditEntry }) {
  const whenLabel = formatAuditWhen(r);
  const whenTitle =
    r.executedAt ?? r.exitTime ?? r.entryTime
      ? formatDateTimeIST(r.executedAt ?? r.exitTime ?? r.entryTime!)
      : undefined;

  return (
    <div className="rounded-lg border border-border bg-bg-primary/50 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p
            className={cn(tableDateTimeTdClass, "text-[11px] text-text-tertiary mb-0.5")}
            title={whenTitle}
          >
            {whenLabel}
          </p>
          <p className="text-sm font-semibold text-text-primary">
            {r.symbol}{" "}
            <span
              className={cn(
                "text-xs font-medium",
                r.side === "BUY" ? "text-profit" : "text-loss"
              )}
            >
              {r.side}
            </span>
          </p>
          <p className="text-xs text-text-tertiary">{r.strategyName}</p>
        </div>
        {r.netPnl != null && (
          <p
            className={cn(
              "text-sm font-semibold tabular-nums",
              r.netPnl >= 0 ? "text-profit" : "text-loss"
            )}
          >
            {formatCurrency(r.netPnl)}
          </p>
        )}
      </div>
      {r.signalReason && (
        <p className="text-xs text-text-secondary line-clamp-2">{r.signalReason}</p>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-text-tertiary">
        {r.signalStrength && <span>{r.signalStrength}</span>}
        {r.entryPrice != null && <span>Entry {formatCurrency(r.entryPrice)}</span>}
        {r.exitPrice != null && <span>Exit {formatCurrency(r.exitPrice)}</span>}
        {r.exitReason && <span>{r.exitReason}</span>}
        <span>Qty {r.qty}</span>
      </div>
    </div>
  );
}

export default function TradeAuditPanel() {
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const state = await getPaperTradingState();
      setTrades(state?.trades ?? []);
    } catch {
      setTrades([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, []);

  const rows = useMemo(() => buildTradeAuditLog(trades), [trades]);

  const { sortKey, sortDir, toggleSort, sortRows } = useTableSort({
    key: "when",
    dir: "desc",
  });
  const sortedRows = useMemo(
    () =>
      sortRows(rows, {
        strategy: (r) => r.strategyName,
        symbol: (r) => r.symbol,
        side: (r) => r.side,
        signal: (r) => r.signalReason ?? "",
        strength: (r) => r.signalStrength ?? "",
        entry: (r) => r.entryPrice ?? 0,
        exit: (r) => r.exitPrice ?? 0,
        exitReason: (r) => r.exitReason ?? "",
        pnl: (r) => r.netPnl ?? 0,
        when: (r) => (r.executedAt ? Date.parse(r.executedAt) : 0),
      }),
    [rows, sortRows]
  );

  function exportCsv() {
    downloadCsv(`trade-audit-${exportDateStamp()}.csv`, buildTradeAuditCsv(rows));
  }

  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-accent-muted p-2">
            <ClipboardList className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Trade audit log</h2>
            <p className="text-xs text-text-secondary">
              Full trail: strategy, signal strength, entry/exit, and exit reason
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-tertiary">
          {loading ? "Loading…" : "No trades yet"}
        </p>
      ) : (
        <>
          <div className="md:hidden space-y-2 max-h-[min(70vh,560px)] overflow-y-auto">
            {sortedRows.map((r) => (
              <AuditCard key={r.id} r={r} />
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto max-h-[min(70vh,560px)] overflow-y-auto">
            <table className="w-full text-xs min-w-[900px]">
              <thead className="sticky top-0 z-10 bg-bg-secondary">
                <tr className="border-b border-border text-text-tertiary text-left">
                  <SortableTh sortKey="when" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className={cn(tableDateTimeThClass, "py-2 pr-2 font-semibold uppercase tracking-wider")}>When</SortableTh>
                  <SortableTh sortKey="strategy" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="py-2 pr-3 font-semibold uppercase tracking-wider">Strategy</SortableTh>
                  <SortableTh sortKey="symbol" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="py-2 pr-3 font-semibold uppercase tracking-wider">Symbol</SortableTh>
                  <SortableTh sortKey="side" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="py-2 pr-3 font-semibold uppercase tracking-wider">Side</SortableTh>
                  <SortableTh sortKey="signal" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="py-2 pr-3 font-semibold uppercase tracking-wider">Signal</SortableTh>
                  <SortableTh sortKey="strength" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="py-2 pr-3 font-semibold uppercase tracking-wider">Strength</SortableTh>
                  <SortableTh sortKey="entry" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="py-2 pr-3 font-semibold uppercase tracking-wider">Entry</SortableTh>
                  <SortableTh sortKey="exit" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="py-2 pr-3 font-semibold uppercase tracking-wider">Exit</SortableTh>
                  <SortableTh sortKey="exitReason" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="py-2 pr-3 font-semibold uppercase tracking-wider">Exit reason</SortableTh>
                  <SortableTh sortKey="pnl" activeKey={sortKey} direction={sortDir} onSort={toggleSort} align="right" className="py-2 pr-3 font-semibold uppercase tracking-wider">P&amp;L</SortableTh>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr key={r.id} className="border-b border-border/40">
                    <td
                      className={cn(tableDateTimeTdClass, "py-2 pr-2")}
                      title={
                        r.executedAt ?? r.exitTime ?? r.entryTime
                          ? formatDateTimeIST(
                              r.executedAt ?? r.exitTime ?? r.entryTime!
                            )
                          : undefined
                      }
                    >
                      {formatAuditWhen(r)}
                    </td>
                    <td className="py-2 pr-3 text-text-primary font-medium">
                      {r.strategyName}
                    </td>
                    <td className="py-2 pr-3">{r.symbol}</td>
                    <td className="py-2 pr-3">{r.side}</td>
                    <td
                      className="py-2 pr-3 text-text-secondary max-w-[160px] truncate"
                      title={r.signalReason}
                    >
                      {r.signalReason ?? "—"}
                    </td>
                    <td className="py-2 pr-3 text-text-secondary">
                      {r.signalStrength || "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-text-secondary">
                      {r.entryPrice != null ? formatCurrency(r.entryPrice) : "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-text-secondary">
                      {r.exitPrice != null ? formatCurrency(r.exitPrice) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-text-secondary">
                      {r.exitReason ?? "—"}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {r.netPnl != null ? formatCurrency(r.netPnl) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
