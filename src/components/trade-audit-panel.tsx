"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Download, RefreshCw } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { buildTradeAuditLog } from "@/lib/portfolio/trade-audit";
import { buildTradeAuditCsv } from "@/lib/export/trade-audit-export";
import { downloadCsv, exportDateStamp } from "@/lib/export/csv";
import { getPaperTradingState } from "@/lib/firebase";
import type { PaperTrade } from "@/lib/firebase";
import type { TradeAuditEntry } from "@/lib/portfolio/types";

function AuditCard({ r }: { r: TradeAuditEntry }) {
  return (
    <div className="rounded-lg border border-border bg-bg-primary/50 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
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
            {rows.map((r) => (
              <AuditCard key={r.id} r={r} />
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto max-h-[min(70vh,560px)] overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-text-tertiary text-left">
                  <th className="py-2 pr-3">Strategy</th>
                  <th className="py-2 pr-3">Symbol</th>
                  <th className="py-2 pr-3">Side</th>
                  <th className="py-2 pr-3">Signal</th>
                  <th className="py-2 pr-3">Strength</th>
                  <th className="py-2 pr-3">Entry</th>
                  <th className="py-2 pr-3">Exit</th>
                  <th className="py-2 pr-3">Exit reason</th>
                  <th className="py-2 pr-3 text-right">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/40">
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
