import type { AppSettings } from "@/lib/firebase";
import type { PortfolioDecision } from "./types";
import { effectivePaperOrderCap } from "./paper-position-size";

export function effectivePaperMaxOrderValue(
  settings: Pick<AppSettings, "paperMaxOrderValue">
): number {
  return effectivePaperOrderCap(settings);
}

/**
 * Rank BUY candidates: strong sectors first, then sector %, signal count, confidence.
 */
export function compareBuyRank(
  a: Pick<
    PortfolioDecision,
    | "symbol"
    | "buySignalCount"
    | "scanConfidence"
    | "sectorChangePercent"
    | "sectorIsStrong"
  >,
  b: Pick<
    PortfolioDecision,
    | "symbol"
    | "buySignalCount"
    | "scanConfidence"
    | "sectorChangePercent"
    | "sectorIsStrong"
  >
): number {
  const strong =
    (b.sectorIsStrong ? 1 : 0) - (a.sectorIsStrong ? 1 : 0);
  if (strong !== 0) return strong;
  if (a.sectorChangePercent != null || b.sectorChangePercent != null) {
    const sectorPct =
      (b.sectorChangePercent ?? Number.NEGATIVE_INFINITY) -
      (a.sectorChangePercent ?? Number.NEGATIVE_INFINITY);
    if (sectorPct !== 0) return sectorPct;
  }
  const strength = (b.buySignalCount ?? 0) - (a.buySignalCount ?? 0);
  if (strength !== 0) return strength;
  const conf = (b.scanConfidence ?? 0) - (a.scanConfidence ?? 0);
  if (conf !== 0) return conf;
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
