import type { OHLC } from "@/types";
import type { AppSettings } from "@/lib/firebase";
import { computeADXSeries, computeADXSlope, latestADX } from "@/lib/market-data/adx";
import type { EntryArchetype } from "@/lib/strategies/entry-exit-compat";

export type MarketRegime = "TRENDING" | "MEAN_REVERSION";

export interface RegimeWeights {
  trend: number;
  momentum: number;
  reversion: number;
}

export interface RegimeSnapshot {
  indexSymbol: string;
  adx: number;
  adxSlope: number;
  regime: MarketRegime;
  regimeScore: number;
  weights: RegimeWeights;
}

export const TRENDING_REGIME_WEIGHTS: RegimeWeights = {
  trend: 0.7,
  momentum: 0.2,
  reversion: 0.1,
};

export const MEAN_REVERSION_REGIME_WEIGHTS: RegimeWeights = {
  trend: 0.2,
  momentum: 0.1,
  reversion: 0.7,
};

export const EQUAL_REGIME_WEIGHTS: RegimeWeights = {
  trend: 1 / 3,
  momentum: 1 / 3,
  reversion: 1 / 3,
};

function clamp(min: number, max: number, v: number): number {
  return Math.min(max, Math.max(min, v));
}

export function regimeWeightForArchetype(
  archetype: EntryArchetype,
  weights: RegimeWeights
): number {
  switch (archetype) {
    case "MOMENTUM_BREAKOUT":
      return weights.momentum;
    case "TREND_FOLLOWING":
      return weights.trend;
    case "MEAN_REVERSION":
      return weights.reversion;
  }
}

export function computeRegimeSnapshot(
  bars: OHLC[],
  settings: Pick<
    AppSettings,
    | "regimeIndexSymbol"
    | "regimeAdxPeriod"
    | "regimeAdxThreshold"
    | "regimeAdxSlopeWindow"
  >
): RegimeSnapshot | null {
  const period = settings.regimeAdxPeriod ?? 14;
  const threshold = settings.regimeAdxThreshold ?? 23;
  const slopeWindow = settings.regimeAdxSlopeWindow ?? 5;
  const indexSymbol = settings.regimeIndexSymbol ?? "^NSEI";

  const adx = latestADX(bars, period);
  if (adx == null) return null;

  const adxSeries = computeADXSeries(bars, period);
  const adxSlope = computeADXSlope(adxSeries, slopeWindow) ?? 0;
  const regime: MarketRegime = adx > threshold ? "TRENDING" : "MEAN_REVERSION";
  const weights =
    regime === "TRENDING" ? TRENDING_REGIME_WEIGHTS : MEAN_REVERSION_REGIME_WEIGHTS;
  const regimeScore = clamp(0, 100, 50 + (adx - threshold) * 1.5 + adxSlope * 10);

  return {
    indexSymbol,
    adx,
    adxSlope,
    regime,
    regimeScore,
    weights,
  };
}

export function formatRegimeSummary(snapshot: RegimeSnapshot): string {
  return `${snapshot.regime} · ADX ${snapshot.adx.toFixed(1)} · slope ${snapshot.adxSlope >= 0 ? "+" : ""}${snapshot.adxSlope.toFixed(2)} · score ${snapshot.regimeScore.toFixed(0)}`;
}
