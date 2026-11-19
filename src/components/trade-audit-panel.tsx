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
import { getOrders, getPaperTradingState } from "@/lib/firebase";
import { firestoreLiveOrdersToPaperTrades } from "@/lib/live-trading/live-order-record";
import { attachFifoNetPnl } from "@/lib/portfolio/trade-period";
import type { TradeAuditEntry } from "@/lib/portfolio/types";

function formatAuditWhen(r: TradeAuditEntry): string {
  const raw = r.executedAt ?? (r.side === "SELL" ? r.exitTime : r.entryTime);
  if (!raw) return "—";
  return formatDateTimeCompactIST(raw);
}

function ModeBadge({ mode }: { mode: "PAPER" | "LIVE" }) {
  return (
    <span
      className={cn(
        "inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        mode === "LIVE"
          ? "bg-emerald-100 text-emerald-800"
          : "bg-sky-100 text-sky-800"
      )}
    >
      {mode === "LIVE" ? "Live" : "Paper"}
    </span>
  );
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
          <div className="flex items-center gap-2 mb-0.5">
            <ModeBadge mode={r.mode} />
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
          </div>
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
  const [rows, setRows] = useState<TradeAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [modeFilter, setModeFilter] = useState<"ALL" | "PAPER" | "LIVE">("ALL");

  async function load() {
    setLoading(true);
    try {
      const [state, orders] = await Promise.all([
        getPaperTradingState(),
        getOrders(1000),
      ]);
      const paperRows = buildTradeAuditLog(state?.trades ?? [], "PAPER");
      const liveTrades = attachFifoNetPnl(
        firestoreLiveOrdersToPaperTrades(
          orders.filter((o) => o.mode === "LIVE")
        )
      );
      const liveRows = buildTradeAuditLog(liveTrades, "LIVE");
      const merged = [...paperRows, ...liveRows].sort((a, b) => {
        const ta = a.executedAt ? Date.parse(a.executedAt) : 0;
        const tb = b.executedAt ? Date.parse(b.executedAt) : 0;
        return tb - ta;
      });
      setRows(merged);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    if (modeFilter === "ALL") return rows;
    return rows.filter((r) => r.mode === modeFilter);
  }, [rows, modeFilter]);

  const { sortKey, sortDir, toggleSort, sortRows } = useTableSort({
    key: "when",
    dir: "desc",
  });
  const sortedRows = useMemo(
    () =>
      sortRows(filtered, {
        mode: (r) => r.mode,
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
    [filtered, sortRows]
  );

  function exportCsv() {
    downloadCsv(`trade-audit-${exportDateStamp()}.csv`, buildTradeAuditCsv(filtered));
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
              Paper and live fills with strategy, signal, entry/exit, and P&amp;L
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-bg-tertiary p-1">
            {(["ALL", "PAPER", "LIVE"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModeFilter(m)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-semibold",
                  modeFilter === m
                    ? "bg-accent text-brand"
                    : "text-text-tertiary hover:bg-bg-hover"
                )}
              >
                {m === "ALL" ? "All" : m === "LIVE" ? "Live" : "Paper"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
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

      {sortedRows.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-tertiary">
          {loading ? "Loading…" : "No trades yet"}
        </p>
      ) : (
        <>
          <div className="md:hidden space-y-2 max-h-[min(70vh,560px)] overflow-y-auto">
            {sortedRows.map((r) => (
              <AuditCard key={`${r.mode}-${r.id}`} r={r} />
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto max-h-[min(70vh,560px)] overflow-y-auto">
            <table className="w-full text-xs min-w-[980px]">
              <thead className="sticky top-0 z-10 bg-bg-secondary">
                <tr className="border-b border-border text-text-tertiary text-left">
                  <SortableTh sortKey="when" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className={cn(tableDateTimeThClass, "py-2 pr-2 font-semibold uppercase tracking-wider")}>When</SortableTh>
                  <SortableTh sortKey="mode" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="py-2 pr-3 font-semibold uppercase tracking-wider">Book</SortableTh>
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
                  <tr key={`${r.mode}-${r.id}`} className="border-b border-border/40">
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
                    <td className="py-2 pr-3">
                      <ModeBadge mode={r.mode} />
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
