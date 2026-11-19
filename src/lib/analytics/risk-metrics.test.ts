import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeRiskMetrics,
  computeSharpeRatio,
  computeMaxDrawdownPct,
  type EquityPoint,
} from "./risk-metrics";

describe("risk-metrics", () => {
  it("computes sharpe and drawdown from equity curve", () => {
    const curve: EquityPoint[] = [
      { timestamp: "1", ms: 1, equity: 100 },
      { timestamp: "2", ms: 2, equity: 105 },
      { timestamp: "3", ms: 3, equity: 103 },
      { timestamp: "4", ms: 4, equity: 110 },
    ];
    const metrics = computeRiskMetrics(curve, [], 100);
    assert.ok(metrics.sharpeRatio >= 0);
    assert.ok(metrics.maxDrawdownPct >= 0);
    assert.equal(metrics.endingEquity, 110);
    // No closed trips → net P&L is 0 even if MTM equity rose.
    assert.equal(metrics.netPnl, 0);
  });

  it("computes profit factor from round trips", () => {
    const curve: EquityPoint[] = [
      { timestamp: "1", ms: 1, equity: 100 },
      { timestamp: "2", ms: 2, equity: 110 },
    ];
    const metrics = computeRiskMetrics(
      curve,
      [
        { symbol: "TCS", exchange: "NSE", pnl: 500, closedAtMs: 2 },
        { symbol: "INFY", exchange: "NSE", pnl: -200, closedAtMs: 3 },
      ],
      100
    );
    assert.equal(metrics.closedRoundTrips, 2);
    assert.ok(metrics.profitFactor > 1);
    assert.equal(metrics.winRate, 50);
    // Equity rose +10 (MTM), but net P&L is realized trips only (300).
    assert.equal(metrics.netPnl, 300);
  });

  it("does not treat mark-to-market equity as net P&L when trips exist", () => {
    const curve: EquityPoint[] = [
      { timestamp: "1", ms: 1, equity: 1_000_000 },
      { timestamp: "2", ms: 2, equity: 1_050_000 }, // includes unrealized
    ];
    const metrics = computeRiskMetrics(
      curve,
      [{ symbol: "SBIN", exchange: "NSE", pnl: 2_500, closedAtMs: 2 }],
      1_000_000
    );
    assert.equal(metrics.netPnl, 2_500);
    assert.equal(metrics.totalReturnPct, 0.25);
  });
});
