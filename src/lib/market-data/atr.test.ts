import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeATR } from "./atr";
import type { OHLC } from "@/types";

function mockBars(count: number, base = 100): OHLC[] {
  const bars: OHLC[] = [];
  for (let i = 0; i < count; i++) {
    const o = base + i;
    bars.push({
      date: `2024-01-${String(i + 1).padStart(2, "0")}`,
      open: o,
      high: o + 5,
      low: o - 3,
      close: o + 1,
      volume: 1000,
    });
  }
  return bars;
}

describe("computeATR", () => {
  it("returns null when not enough bars", () => {
    assert.equal(computeATR(mockBars(5), 14), null);
  });

  it("returns positive ATR for sufficient bars", () => {
    const atr = computeATR(mockBars(20), 14);
    assert.ok(atr != null && atr > 0);
  });
});
