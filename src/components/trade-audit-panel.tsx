"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, RefreshCw } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { buildTradeAuditLog } from "@/lib/portfolio/trade-audit";
import { getPaperTradingState } from "@/lib/firebase";
import type { PaperTrade } from "@/lib/firebase";

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

  return (
    <section className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-accent-muted p-2">
            <ClipboardList className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Trade audit log</h2>
            <p className="text-xs text-text-secondary">
              Strategy, signal reason, entry/exit, and exit reason per fill
            </p>
          </div>
        </div>
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

      <div className="overflow-x-auto max-h-[min(70vh,560px)] overflow-y-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-text-tertiary text-left">
              <th className="py-2 pr-3">Strategy</th>
              <th className="py-2 pr-3">Symbol</th>
              <th className="py-2 pr-3">Side</th>
              <th className="py-2 pr-3">Signal reason</th>
              <th className="py-2 pr-3">Entry</th>
              <th className="py-2 pr-3">Exit</th>
              <th className="py-2 pr-3">Exit reason</th>
              <th className="py-2 pr-3 text-right">P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-text-tertiary">
                  {loading ? "Loading…" : "No trades yet"}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
