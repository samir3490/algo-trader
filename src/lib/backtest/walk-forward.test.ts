import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runWalkForward } from "./walk-forward";
import { runGridSearch, defaultGridRanges } from "./grid-search";
import type { OHLC } from "@/types";

function syntheticCandles(n: number, startYear = 2022): OHLC[] {
  const bars: OHLC[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    price += Math.sin(i / 7) * 1.5 + 0.02;
    bars.push({
      date: new Date(Date.UTC(startYear, 0, 1 + i)),
      open: price,
      high: price + 1,
      low: price - 1,
      close: price,
      volume: 1000,
    });
  }
  return bars;
}

describe("runWalkForward", () => {
  it("produces in-sample and out-of-sample windows", () => {
    const candles = syntheticCandles(800);
    const start = candles[0].date;
    const end = candles[candles.length - 1].date;
    const result = runWalkForward(candles, {
      strategyId: "sma",
      symbol: "TEST",
      startDate: start,
      endDate: end,
      initialCapital: 100_000,
      trainMonths: 12,
      testMonths: 3,
    });
    assert.ok(result.windows.length >= 1);
    const w = result.windows[0];
    assert.ok(w.inSample.totalReturnPct !== undefined);
    assert.ok(w.outOfSample.totalReturnPct !== undefined);
    assert.equal(typeof w.overfitWarning, "boolean");
  });
});

describe("runGridSearch", () => {
  it("returns ranked parameter combinations", () => {
    const candles = syntheticCandles(120);
    const ranges = defaultGridRanges("sma").map((r) => ({
      ...r,
      values: r.values.slice(0, 2),
    }));
    const result = runGridSearch(candles, {
      strategyId: "sma",
      symbol: "TEST",
      startDate: candles[0].date,
      endDate: candles[candles.length - 1].date,
      initialCapital: 100_000,
      paramRanges: ranges,
      maxResults: 5,
    });
    assert.ok(result.combinationsTested >= 4);
    assert.ok(result.rows.length <= 5);
    assert.equal(result.rows[0]?.rank, 1);
    assert.ok(result.best);
  });
});
