import { fetchYahooQuote } from "@/lib/market-data/yahoo";

/** Max % gap between signal/bar hint and live quote before we trust live only. */
export const MAX_EXECUTION_HINT_DEVIATION_PCT = 8;

export interface ResolvedExecutionPrice {
  price: number;
  source: "live" | "hint";
  livePrice?: number;
  hintPrice?: number;
  deviationPct?: number;
}

export function executionPriceDeviationPct(
  hint: number,
  live: number
): number {
  if (!Number.isFinite(hint) || !Number.isFinite(live) || live <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return (Math.abs(hint - live) / live) * 100;
}

/**
 * Paper/live execution must use a current market quote — not stale bar closes.
 * When a hint exists but diverges too far from live, live wins.
 */
export async function resolvePaperExecutionPrice(
  symbol: string,
  exchange: string,
  hintPrice?: number,
  options?: { requireLive?: boolean }
): Promise<ResolvedExecutionPrice | null> {
  const quote = await fetchYahooQuote(symbol, exchange);
  const livePrice =
    quote?.lastPrice && quote.lastPrice > 0 ? quote.lastPrice : undefined;

  if (livePrice != null) {
    if (hintPrice != null && hintPrice > 0) {
      const deviationPct = executionPriceDeviationPct(hintPrice, livePrice);
      if (deviationPct > MAX_EXECUTION_HINT_DEVIATION_PCT) {
        return {
          price: livePrice,
          source: "live",
          livePrice,
          hintPrice,
          deviationPct,
        };
      }
    }
    return {
      price: livePrice,
      source: "live",
      livePrice,
      hintPrice,
    };
  }

  if (options?.requireLive) return null;

  if (hintPrice != null && hintPrice > 0) {
    return { price: hintPrice, source: "hint", hintPrice };
  }

  return null;
}
