import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeLiveDeployedCapital,
  evaluateLiveBuyLimits,
  qtyForLiveNotional,
  resolveLiveCapitalLimit,
  resolveLiveOrderNotional,
} from "./capital-limits";

describe("live capital limits", () => {
  it("resolves defaults", () => {
    assert.equal(resolveLiveOrderNotional({}), 5_000);
    assert.equal(resolveLiveCapitalLimit({}), 50_000);
    assert.equal(resolveLiveOrderNotional({ liveOrderNotional: 7_500 }), 7_500);
  });

  it("computes deployed from positions and holdings", () => {
    const deployed = computeLiveDeployedCapital(
      [{ qty: 10, avgPrice: 100 }],
      [{ quantity: 5, average_price: 200, invested: 1000 }]
    );
    assert.equal(deployed, 1000 + 1000);
  });

  it("blocks oversize per-trade buys", () => {
    const result = evaluateLiveBuyLimits({
      side: "BUY",
      qty: 20,
      price: 300,
      settings: { liveOrderNotional: 5_000, liveCapitalLimit: 50_000 },
      positions: [],
      holdings: [],
    });
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /per-trade limit/i);
  });

  it("blocks buys when capital limit is exhausted", () => {
    const result = evaluateLiveBuyLimits({
      side: "BUY",
      qty: 20,
      price: 100,
      settings: { liveOrderNotional: 5_000, liveCapitalLimit: 50_000 },
      positions: [{ qty: 490, avgPrice: 100 }],
      holdings: [],
    });
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /capital limit/i);
  });

  it("allows sells and in-limit buys", () => {
    assert.equal(
      evaluateLiveBuyLimits({
        side: "SELL",
        qty: 100,
        price: 500,
        settings: { liveOrderNotional: 5_000, liveCapitalLimit: 50_000 },
        positions: [{ qty: 100, avgPrice: 400 }],
        holdings: [],
      }).ok,
      true
    );
    assert.equal(
      evaluateLiveBuyLimits({
        side: "BUY",
        qty: 10,
        price: 400,
        settings: { liveOrderNotional: 5_000, liveCapitalLimit: 50_000 },
        positions: [],
        holdings: [],
      }).ok,
      true
    );
  });

  it("sizes qty from notional", () => {
    assert.equal(qtyForLiveNotional(5_000, 1_250), 4);
    assert.equal(qtyForLiveNotional(5_000, 6_000), 1);
  });
});
