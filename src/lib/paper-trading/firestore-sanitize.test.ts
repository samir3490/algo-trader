import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizePaperTradingPayload } from "./firestore-sanitize";

describe("sanitizePaperTradingPayload", () => {
  it("strips undefined fields from trades and positions", () => {
    const out = sanitizePaperTradingPayload({
      balance: 1_000_000,
      holdings: [],
      positions: [
        {
          id: "p1",
          symbol: "TCS",
          exchange: "NSE",
          quantity: 10,
          entryPrice: 100,
          ltp: 101,
          ownerStrategyId: "s1",
          ownerStrategyName: undefined,
          state: "OPEN",
          entryTime: "2026-01-01T00:00:00.000Z",
          signalReason: undefined,
        },
      ],
      trades: [
        {
          id: "t1",
          time: "x",
          symbol: "TCS",
          exchange: "NSE",
          side: "BUY",
          qty: 10,
          price: 100,
          executedAt: undefined,
          strategyName: "MA",
          reason: undefined,
        },
      ],
    });

    assert.equal(out.balance, 1_000_000);
    assert.equal(out.trades.length, 1);
    assert.equal("executedAt" in out.trades[0], false);
    assert.equal("reason" in out.trades[0], false);
    assert.equal("ownerStrategyName" in out.positions[0], false);
  });

  it("replaces NaN balance with zero", () => {
    const out = sanitizePaperTradingPayload({
      balance: NaN,
      holdings: [],
      positions: [],
      trades: [],
    });
    assert.equal(out.balance, 0);
  });
});
