import type { AppSettings } from "@/lib/firebase";
import type { PortfolioDecision } from "./types";
import { paperOrderNotional } from "./paper-position-size";

export function effectivePaperMaxOrderValue(
  settings: Pick<AppSettings, "maxOrderValue" | "paperOrderNotional">
): number {
  return Math.max(settings.maxOrderValue ?? 0, paperOrderNotional(settings));
}

/** Rank BUY candidates: most signals first, then alphabetical by symbol. */
export function compareBuyRank(
  a: Pick<PortfolioDecision, "symbol" | "buySignalCount">,
  b: Pick<PortfolioDecision, "symbol" | "buySignalCount">
): number {
  const strength = (b.buySignalCount ?? 0) - (a.buySignalCount ?? 0);
  if (strength !== 0) return strength;
  return a.symbol.localeCompare(b.symbol, "en", { sensitivity: "base" });
}

export function rankBuyDecisionsByStrength(
  decisions: PortfolioDecision[]
): PortfolioDecision[] {
  return [...decisions]
    .filter((d) => d.action === "BUY")
    .sort(compareBuyRank);
}

export function remainingPositionSlots(
  openPositionCount: number,
  maxPositions: number
): number {
  return Math.max(0, maxPositions - openPositionCount);
}

/**
 * Ranked queue capped to available position slots (from settings maxPositions).
 */
export function selectTopBuyDecisionsForScan(
  decisions: PortfolioDecision[],
  options: {
    openPositionCount: number;
    maxPositions: number;
  }
): {
  ranked: PortfolioDecision[];
  toExecute: PortfolioDecision[];
  deferred: PortfolioDecision[];
  slotsToFill: number;
} {
  const ranked = rankBuyDecisionsByStrength(decisions);
  const slotsToFill = remainingPositionSlots(
    options.openPositionCount,
    options.maxPositions
  );
  return {
    ranked,
    slotsToFill,
    toExecute: ranked.slice(0, slotsToFill),
    deferred: ranked.slice(slotsToFill),
  };
}
