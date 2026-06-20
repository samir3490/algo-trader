import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OHLC } from "@/types";
import {
  computeRegimeSnapshot,
  regimeWeightForArchetype,
  TRENDING_REGIME_WEIGHTS,
  MEAN_REVERSION_REGIME_WEIGHTS,
} from "./regime";

function trendingBars(): OHLC[] {
  const bars: OHLC[] = [];
  let price = 100;
  for (let i = 0; i < 80; i++) {
    price += 0.8 + (i % 3) * 0.1;
    bars.push({
      date: `2024-01-${String((i % 28) + 1).padStart(2, "0")}`,
      open: price,
      high: price + 2,
      low: price - 0.5,
      close: price + 1,
      volume: 1_000_000,
    });
  }
  return bars;
}

describe("regime", () => {
  it("selects trending weights when ADX above threshold", () => {
    const snap = computeRegimeSnapshot(trendingBars(), {
      regimeIndexSymbol: "^NSEI",
      regimeAdxPeriod: 14,
      regimeAdxThreshold: 5,
      regimeAdxSlopeWindow: 5,
    });
    assert.ok(snap);
    assert.equal(snap.regime, "TRENDING");
    assert.deepEqual(snap.weights, TRENDING_REGIME_WEIGHTS);
  });

  it("maps archetype to regime weight bucket", () => {
    assert.equal(
      regimeWeightForArchetype("MOMENTUM_BREAKOUT", TRENDING_REGIME_WEIGHTS),
      0.2
    );
    assert.equal(
      regimeWeightForArchetype("MEAN_REVERSION", MEAN_REVERSION_REGIME_WEIGHTS),
      0.7
    );
  });
});
