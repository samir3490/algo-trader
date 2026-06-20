import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OHLC } from "@/types";
import { computeADXSeries, computeADXSlope, latestADX } from "./adx";

function syntheticBars(count: number): OHLC[] {
  const bars: OHLC[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const drift = Math.sin(i / 5) * 2 + 0.05;
    price += drift;
    const high = price + 1.5;
    const low = price - 1.5;
    bars.push({
      date: `2024-01-${String(i + 1).padStart(2, "0")}`,
      open: price,
      high,
      low,
      close: price + 0.2,
      volume: 1_000_000,
    });
  }
  return bars;
}

describe("adx", () => {
  it("returns null ADX when not enough bars", () => {
    assert.equal(latestADX(syntheticBars(10), 14), null);
  });

  it("returns positive ADX for sufficient bars", () => {
    const adx = latestADX(syntheticBars(60), 14);
    assert.ok(adx != null);
    assert.ok(adx > 0 && adx < 100);
  });

  it("computes ADX slope over window", () => {
    const series = computeADXSeries(syntheticBars(60), 14);
    const slope = computeADXSlope(series, 5);
    assert.ok(slope != null);
    assert.ok(Number.isFinite(slope));
  });
});
