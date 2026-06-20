import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OHLC } from "@/types";
import {
  getEntryArchetype,
  isExitCompatible,
  filterCompatibleSellOpinions,
  rsiSellValidForEntry,
} from "./entry-exit-compat";
import type { PaperPosition, StrategyOpinion } from "@/lib/portfolio/types";

function barsWithRsiCross(from: number, to: number, overbought: number): OHLC[] {
  const closes: number[] = [];
  for (let i = 0; i < 30; i++) closes.push(100);
  for (let i = 0; i < 10; i++) closes.push(100 + i * 2);
  closes[closes.length - 2] = 100 + (overbought + 2);
  closes[closes.length - 1] = 100 + (overbought - 2);

  return closes.map((close, i) => ({
    date: `2024-01-${String(i + 1).padStart(2, "0")}`,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1_000_000,
  }));
}

describe("entry-exit-compat", () => {
  it("maps breakout to momentum archetype", () => {
    assert.equal(getEntryArchetype("breakout"), "MOMENTUM_BREAKOUT");
    assert.equal(getEntryArchetype("rsi"), "MEAN_REVERSION");
    assert.equal(getEntryArchetype("sma"), "TREND_FOLLOWING");
  });

  it("blocks reversion sell on trend entry", () => {
    assert.equal(
      isExitCompatible("TREND_FOLLOWING", "bollinger"),
      false
    );
    assert.equal(isExitCompatible("TREND_FOLLOWING", "macd"), true);
  });

  it("allows RSI on momentum with higher threshold only", () => {
    const bars = barsWithRsiCross(72, 68, 70);
    assert.equal(
      rsiSellValidForEntry(
        bars,
        "MOMENTUM_BREAKOUT",
        { period: 14, oversold: 30, overbought: 70, quantity: 1 },
        { momentumRsiOverbought: 85 }
      ),
      false
    );
  });

  it("filterCompatibleSellOpinions drops incompatible strategies", () => {
    const position: PaperPosition = {
      id: "p1",
      symbol: "RELIANCE",
      exchange: "NSE",
      quantity: 10,
      entryPrice: 100,
      ltp: 106,
      ownerStrategyId: "breakout-1",
      ownerStrategyName: "Price Breakout",
      ownerStrategyType: "breakout",
      ownerEntryArchetype: "MOMENTUM_BREAKOUT",
      state: "OPEN",
      entryTime: new Date().toISOString(),
    };
    const opinions: StrategyOpinion[] = [
      {
        strategyId: "rsi-1",
        strategyName: "RSI Strategy",
        strategyType: "rsi",
        symbol: "RELIANCE",
        exchange: "NSE",
        action: "SELL",
        price: 106,
        quantity: 10,
        reason: "RSI crossed below overbought (70)",
        confidence: 0.65,
      },
      {
        strategyId: "bb-1",
        strategyName: "Bollinger Bands",
        strategyType: "bollinger",
        symbol: "RELIANCE",
        exchange: "NSE",
        action: "SELL",
        price: 106,
        quantity: 10,
        reason: "Upper band touch",
        confidence: 0.6,
      },
    ];
    const filtered = filterCompatibleSellOpinions(
      opinions,
      position,
      { momentumRsiOverbought: 85, enableEntryConnectedExits: true },
      { bars: barsWithRsiCross(86, 84, 85) }
    );
    assert.equal(filtered.some((o) => o.strategyType === "bollinger"), false);
  });
});
