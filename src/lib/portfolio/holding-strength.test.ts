import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveHoldingBuySignalCount } from "./holding-strength";

describe("resolveHoldingBuySignalCount", () => {
  it("uses holding buySignalCount when set", () => {
    assert.equal(
      resolveHoldingBuySignalCount(
        { symbol: "TCS", exchange: "NSE", qty: 10, avgPrice: 100, ltp: 100, buySignalCount: 4 },
        []
      ),
      4
    );
  });

  it("falls back to opening BUY trade", () => {
    assert.equal(
      resolveHoldingBuySignalCount(
        { symbol: "INFY", exchange: "NSE", qty: 5, avgPrice: 1500, ltp: 1500 },
        [
          {
            id: "t1",
            time: "10:00",
            symbol: "INFY",
            exchange: "NSE",
            side: "BUY",
            qty: 5,
            price: 1500,
            buySignalCount: 3,
            executedAt: "2026-05-27T10:00:00.000Z",
          },
        ]
      ),
      3
    );
  });
});
