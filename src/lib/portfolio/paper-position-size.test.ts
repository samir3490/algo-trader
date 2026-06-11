import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  effectivePaperOrderCap,
  integerShareQtyForBudget,
  paperOrderNotional,
  resolvePaperOrderQty,
  resolvePaperScanOrderQty,
} from "./paper-position-size";

const settings = {
  paperOrderNotional: 100_000,
  maxOrderValue: 500_000,
  defaultQuantity: 1,
};

describe("integerShareQtyForBudget", () => {
  it("returns whole shares up to budget", () => {
    assert.equal(integerShareQtyForBudget(3333, 100_000), 30);
  });

  it("returns 0 when one share exceeds budget", () => {
    assert.equal(integerShareQtyForBudget(150_000, 100_000), 0);
  });

  it("respects available balance", () => {
    assert.equal(integerShareQtyForBudget(100, 100_000, 5000), 50);
  });
});

describe("resolvePaperOrderQty", () => {
  it("buys ~1L notional for a ₹10 stock", () => {
    assert.equal(resolvePaperOrderQty(10, settings), 10_000);
  });

  it("buys ~1L notional for a ₹1000 stock", () => {
    assert.equal(resolvePaperOrderQty(1000, settings), 100);
  });

  it("respects available balance", () => {
    assert.equal(resolvePaperOrderQty(100, settings, { balance: 5000 }), 50);
  });

  it("returns 0 when share price exceeds budget", () => {
    assert.equal(resolvePaperOrderQty(150_000, settings), 0);
  });

  it("uses explicit strategy quantity when set", () => {
    assert.equal(
      resolvePaperOrderQty(1000, settings, { strategyParams: { quantity: 5 } }),
      5
    );
  });
});

describe("resolvePaperScanOrderQty", () => {
  it("ignores default quantity=1 and uses notional", () => {
    assert.equal(
      resolvePaperScanOrderQty(100, settings, { strategyParams: { quantity: 1 } }),
      1000
    );
  });

  it("respects explicit quantity when > 1", () => {
    assert.equal(
      resolvePaperScanOrderQty(100, settings, { strategyParams: { quantity: 50 } }),
      50
    );
  });
});

describe("paperOrderNotional", () => {
  it("defaults to 1 lakh", () => {
    assert.equal(
      paperOrderNotional({ paperOrderNotional: 100_000, maxOrderValue: 500_000 }),
      100_000
    );
  });
});

describe("effectivePaperOrderCap", () => {
  it("is at least paper notional even when maxOrderValue is lower", () => {
    assert.equal(
      effectivePaperOrderCap({ paperOrderNotional: 100_000, maxOrderValue: 50_000 }),
      100_000
    );
  });
});
