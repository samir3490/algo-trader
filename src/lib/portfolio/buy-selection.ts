import type { AppSettings } from "@/lib/firebase";
import type { PortfolioDecision } from "./types";
import { paperOrderNotional } from "./paper-position-size";

/** Max new BUY orders placed per strategy scan. */
export const MAX_BUYS_PER_SCAN = 5;

export function effectivePaperMaxOrderValue(
  settings: Pick<AppSettings, "maxOrderValue" | "paperOrderNotional">
): number {
  return Math.max(settings.maxOrderValue ?? 0, paperOrderNotional(settings));
}

export function rankBuyDecisionsByStrength(
  decisions: PortfolioDecision[]
): PortfolioDecision[] {
  return [...decisions]
    .filter((d) => d.action === "BUY")
    .sort((a, b) => {
      const strength = (b.buySignalCount ?? 0) - (a.buySignalCount ?? 0);
      if (strength !== 0) return strength;
      return b.price * b.quantity - a.price * a.quantity;
    });
}

/**
 * When more than `limit` BUYs qualify, keep the strongest symbols only.
 * Also respects remaining position slots vs maxPositions.
 */
export function selectTopBuyDecisionsForScan(
  decisions: PortfolioDecision[],
  options: {
    openPositionCount: number;
    maxPositions: number;
    perScanLimit?: number;
  }
): {
  toExecute: PortfolioDecision[];
  deferred: PortfolioDecision[];
} {
  const limit = options.perScanLimit ?? MAX_BUYS_PER_SCAN;
  const ranked = rankBuyDecisionsByStrength(decisions);
  const remainingSlots = Math.max(
    0,
    Math.min(limit, options.maxPositions - options.openPositionCount)
  );
  return {
    toExecute: ranked.slice(0, remainingSlots),
    deferred: ranked.slice(remainingSlots),
  };
}
