import type { PaperHolding, PaperTrade } from "@/lib/firebase";
import type { PaperPosition } from "./types";
import { OWNER_MANUAL } from "./types";
import { tradeExecutedAtMs } from "@/lib/paper-trades/normalize";

function symKey(symbol: string, exchange: string): string {
  return `${symbol.trim().toUpperCase()}:${(exchange || "NSE").trim().toUpperCase()}`;
}

/** Infer owner from most recent BUY trade for symbol. */
function inferOwnerFromTrades(
  trades: PaperTrade[],
  symbol: string,
  exchange: string
): {
  ownerStrategyId: string;
  ownerStrategyName?: string;
  entryTime?: string;
  entryPrice?: number;
  signalReason?: string;
  buySignalCount?: number;
} {
  const key = symKey(symbol, exchange);
  const buys = trades
    .filter(
      (t) =>
        t.side === "BUY" && symKey(t.symbol, t.exchange) === key
    )
    .sort((a, b) => tradeExecutedAtMs(b) - tradeExecutedAtMs(a));
  const last = buys[0];
  if (!last) {
    return { ownerStrategyId: OWNER_MANUAL };
  }
  return {
    ownerStrategyId: last.strategyId ?? last.ownerStrategyId ?? OWNER_MANUAL,
    ownerStrategyName: last.strategyName,
    entryTime: last.executedAt ?? last.time,
    entryPrice: last.price,
    signalReason: last.reason,
    buySignalCount: last.buySignalCount,
  };
}

/** One-time migration: legacy holdings → owned positions. */
export function migrateHoldingsToPositions(
  holdings: PaperHolding[] = [],
  trades: PaperTrade[] = []
): PaperPosition[] {
  const positions: PaperPosition[] = [];
  for (const h of holdings) {
    if (!h.qty || h.qty <= 0) continue;
    const owner = h.ownerStrategyId
      ? {
          ownerStrategyId: h.ownerStrategyId,
          ownerStrategyName: h.ownerStrategyName,
        }
      : inferOwnerFromTrades(trades, h.symbol, h.exchange);
    const meta = inferOwnerFromTrades(trades, h.symbol, h.exchange);
    positions.push({
      id: `pos-mig-${h.symbol}-${h.exchange}-${positions.length}`,
      symbol: h.symbol.trim().toUpperCase(),
      exchange: (h.exchange || "NSE").trim().toUpperCase(),
      quantity: h.qty,
      entryPrice: h.avgPrice,
      ltp: h.ltp > 0 ? h.ltp : h.avgPrice,
      ownerStrategyId: owner.ownerStrategyId,
      ownerStrategyName: owner.ownerStrategyName ?? meta.ownerStrategyName,
      state: "OPEN",
      entryTime: meta.entryTime ?? new Date().toISOString(),
      signalReason: meta.signalReason,
      buySignalCount: h.buySignalCount ?? meta.buySignalCount,
    });
  }
  return positions;
}
