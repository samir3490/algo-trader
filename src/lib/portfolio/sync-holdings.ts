import type { PaperHolding } from "@/lib/firebase";
import type { PaperPosition } from "./types";

function symKey(symbol: string, exchange: string): string {
  return `${symbol.trim().toUpperCase()}:${(exchange || "NSE").trim().toUpperCase()}`;
}

/** Aggregate open positions into legacy holdings view for UI / portfolio math. */
export function syncHoldingsFromPositions(
  positions: PaperPosition[]
): PaperHolding[] {
  const open = positions.filter(
    (p) => p.state === "OPEN" || p.state === "PARTIAL_EXIT"
  );
  const byKey = new Map<string, PaperHolding>();

  for (const p of open) {
    const key = symKey(p.symbol, p.exchange);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        symbol: p.symbol.trim().toUpperCase(),
        exchange: (p.exchange || "NSE").trim().toUpperCase(),
        qty: p.quantity,
        avgPrice: p.entryPrice,
        ltp: p.ltp > 0 ? p.ltp : p.entryPrice,
        ownerStrategyId: p.ownerStrategyId,
        ownerStrategyName: p.ownerStrategyName,
        buySignalCount: p.buySignalCount,
      });
      continue;
    }
    const newQty = existing.qty + p.quantity;
    existing.avgPrice =
      Math.round(
        ((existing.avgPrice * existing.qty + p.entryPrice * p.quantity) / newQty) *
          100
      ) / 100;
    existing.qty = newQty;
    existing.ltp = p.ltp > 0 ? p.ltp : existing.ltp;
  }

  return [...byKey.values()];
}
