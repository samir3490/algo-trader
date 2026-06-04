import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runBacktest } from "./engine";
import type { OHLC } from "@/types";

function syntheticCandles(n: number): OHLC[] {
  const bars: OHLC[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    price += Math.sin(i / 5) * 2;
    bars.push({
      date: new Date(Date.UTC(2024, 0, 1 + i)),
      open: price,
      high: price + 1,
      low: price - 1,
      close: price,
      volume: 1000,
    });
  }
  return bars;
}

describe("runBacktest", () => {
  it("runs without look-ahead and returns metrics", () => {
    const candles = syntheticCandles(120);
    const result = runBacktest(candles, {
      strategyId: "sma",
      symbol: "TEST",
      startDate: candles[0].date,
      endDate: candles[candles.length - 1].date,
      initialCapital: 100_000,
    });
    assert.ok(Number.isFinite(result.totalReturnPct));
    assert.ok(result.equityCurve.length > 0);
  });
});
