import type { PaperTrade } from "@/lib/firebase";
import type { TradeAuditEntry } from "./types";

/** Build audit rows from trade history for UI. */
export function buildTradeAuditLog(trades: PaperTrade[]): TradeAuditEntry[] {
  const sorted = [...trades].sort((a, b) => {
    const ta = a.executedAt ? Date.parse(a.executedAt) : 0;
    const tb = b.executedAt ? Date.parse(b.executedAt) : 0;
    return tb - ta;
  });

  return sorted.map((t) => ({
    id: t.id,
    strategyName: t.strategyName ?? t.ownerStrategyId ?? "Manual",
    ownerStrategyId: t.ownerStrategyId ?? t.strategyId ?? "manual",
    symbol: t.symbol,
    exchange: t.exchange,
    signalReason: t.reason,
    entryTime: t.entryTime ?? (t.side === "BUY" ? t.executedAt : undefined),
    entryPrice: t.entryPrice ?? (t.side === "BUY" ? t.price : undefined),
    exitTime: t.exitTime ?? (t.side === "SELL" ? t.executedAt : undefined),
    exitPrice: t.exitPrice ?? (t.side === "SELL" ? t.price : undefined),
    exitReason: t.exitReason,
    side: t.side,
    qty: t.qty,
    netPnl: t.netPnl,
  }));
}
