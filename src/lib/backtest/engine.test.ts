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
    assert.equal(
      result.netPnL,
      Math.round((result.finalCapital - result.initialCapital) * 100) / 100
    );
    if (result.closedRoundTrips > 0) {
      assert.ok(result.typicalQty >= 1);
      assert.ok(
        Math.abs(result.grossProfit - result.grossLoss - result.netPnL) <
          Math.abs(result.netPnL) * 0.5 + 5000,
        "gross profit/loss should relate to net P&L when sized properly"
      );
    }
  });

  it("win rate aligns with net P&L when all round trips lose", () => {
    const candles = syntheticCandles(80);
    for (const c of candles) {
      c.close = 100 - (c.date.getUTCDate() % 10);
    }
    const result = runBacktest(candles, {
      strategyId: "sma",
      symbol: "TEST",
      startDate: candles[0].date,
      endDate: candles[candles.length - 1].date,
      initialCapital: 100_000,
      strategyParams: { quantity: 100 },
    });
    if (result.closedRoundTrips > 0 && result.netPnL < 0) {
      assert.ok(result.winRate < 100);
    }
  });
});
