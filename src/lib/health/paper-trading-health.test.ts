import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assessPaperTradingHealth,
  isCronStale,
  isMarketHoursIST,
} from "./paper-trading-health";

describe("paper-trading-health", () => {
  it("flags stale cron during market hours", () => {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60_000).toISOString();
    assert.equal(isCronStale(thirtyMinAgo, true), true);
    assert.equal(isCronStale(thirtyMinAgo, false), false);
  });

  it("assesses critical when portfolio has drift errors", () => {
    const health = assessPaperTradingHealth({
      marketOpen: false,
      paperState: {
        balance: 1_000_000,
        positions: [
          {
            id: "p1",
            symbol: "INFY",
            exchange: "NSE",
            quantity: 5,
            entryPrice: 1500,
            ltp: 1500,
            ownerStrategyId: "s1",
            state: "OPEN",
            entryTime: "2026-05-27T10:00:00.000Z",
          },
        ],
        holdings: [
          {
            symbol: "INFY",
            exchange: "NSE",
            qty: 10,
            avgPrice: 1500,
            ltp: 1500,
          },
        ],
        trades: [],
      },
      runnerMeta: {
        lastCronAt: new Date().toISOString(),
        lastScanSummary: {
          ranAt: new Date().toISOString(),
          scanned: 3,
          signalsFound: 2,
          tradesExecuted: 0,
          diagnostics: {
            buySignals: 2,
            sellSignals: 0,
            buyDecisions: 2,
            sellDecisions: 0,
            skippedDecisions: 0,
            gateBlocked: 0,
            riskBlocked: 0,
            dedupeBlocked: 0,
            liveSignals: 0,
            paperSignals: 2,
            skipReasons: {},
          },
        },
      },
    });

    assert.equal(health.level, "critical");
    assert.ok(health.alerts.some((a) => a.id === "portfolio_drift"));
    assert.equal(health.scan.zeroTradeWithSignals, true);
  });

  it("exports market hours helper", () => {
    assert.equal(typeof isMarketHoursIST(), "boolean");
  });
});
