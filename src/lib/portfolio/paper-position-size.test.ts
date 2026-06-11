import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  paperOrderNotional,
  resolvePaperOrderQty,
  resolvePaperScanOrderQty,
} from "./paper-position-size";

const settings = {
  paperOrderNotional: 100_000,
  maxOrderValue: 500_000,
  defaultQuantity: 1,
};

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

  it("caps at maxOrderValue when lower", () => {
    assert.equal(
      paperOrderNotional({ paperOrderNotional: 100_000, maxOrderValue: 50_000 }),
      50_000
    );
  });
});
