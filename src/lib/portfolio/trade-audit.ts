import type { PaperTrade } from "@/lib/firebase";
import { tradeExecutedAtMs } from "@/lib/paper-trades/normalize";
import type { TradeAuditEntry } from "./types";

function resolveExecutedAt(t: PaperTrade): string | undefined {
  if (t.executedAt) return t.executedAt;
  const ms = tradeExecutedAtMs(t);
  return ms > 0 ? new Date(ms).toISOString() : undefined;
}

function strengthLabel(count?: number): string {
  if (!count || count <= 0) return "";
  if (count >= 5) return `Strong · ${count}`;
  if (count >= 3) return `Moderate · ${count}`;
  if (count >= 2) return `Light · ${count}`;
  return `Single · ${count}`;
}

/** Build audit rows from trade history for UI and compliance export. */
export function buildTradeAuditLog(trades: PaperTrade[]): TradeAuditEntry[] {
  const sorted = [...trades].sort(
    (a, b) => tradeExecutedAtMs(b) - tradeExecutedAtMs(a)
  );

  return sorted.map((t) => {
    const executedAt = resolveExecutedAt(t);
    return {
    id: t.id,
    strategyName: t.strategyName ?? t.ownerStrategyId ?? "Manual",
    ownerStrategyId: t.ownerStrategyId ?? t.strategyId ?? "manual",
    symbol: t.symbol,
    exchange: t.exchange,
    signalReason: t.reason,
    signalStrength: strengthLabel(t.buySignalCount),
    entryTime: t.entryTime ?? (t.side === "BUY" ? executedAt : undefined),
    entryPrice: t.entryPrice ?? (t.side === "BUY" ? t.price : undefined),
    exitTime: t.exitTime ?? (t.side === "SELL" ? executedAt : undefined),
    exitPrice: t.exitPrice ?? (t.side === "SELL" ? t.price : undefined),
    exitReason: t.exitReason,
    side: t.side,
    qty: t.qty,
    netPnl: t.netPnl,
    executedAt,
  };
  });
}
