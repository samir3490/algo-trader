import type { PaperHolding, PaperTrade } from "@/lib/firebase";
import { tradeExecutedAtMs } from "@/lib/paper-trades/normalize";

function symKey(symbol: string, exchange: string): string {
  return `${symbol.trim().toUpperCase()}:${(exchange || "NSE").trim().toUpperCase()}`;
}

/** Resolve buy consensus count for a holding from its row or opening BUY trade. */
export function resolveHoldingBuySignalCount(
  holding: Pick<PaperHolding, "symbol" | "exchange" | "buySignalCount">,
  trades: PaperTrade[] = []
): number | undefined {
  if (holding.buySignalCount != null && holding.buySignalCount > 0) {
    return holding.buySignalCount;
  }

  const key = symKey(holding.symbol, holding.exchange);
  const buys = trades
    .filter(
      (t) => t.side === "BUY" && symKey(t.symbol, t.exchange) === key
    )
    .sort((a, b) => tradeExecutedAtMs(b) - tradeExecutedAtMs(a));

  for (const t of buys) {
    if (t.buySignalCount != null && t.buySignalCount > 0) {
      return t.buySignalCount;
    }
  }

  return undefined;
}
