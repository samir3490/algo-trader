import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeZerodhaCharges, cashFlowForTrade, sumChargeBreakdown } from "./zerodha-charges";

describe("computeZerodhaCharges", () => {
  it("CNC buy has stamp duty and STT, zero brokerage", () => {
    const c = computeZerodhaCharges({
      side: "BUY",
      qty: 10,
      price: 100,
      product: "CNC",
    });
    assert.equal(c.brokerage, 0);
    assert.ok(c.stt > 0);
    assert.ok(c.stampDuty > 0);
    assert.ok(c.total > 0);
    assert.equal(sumChargeBreakdown(c), c.total);
  });

  it("MIS sell has brokerage cap and STT", () => {
    const c = computeZerodhaCharges({
      side: "SELL",
      qty: 100,
      price: 500,
      product: "MIS",
    });
    assert.ok(c.brokerage > 0);
    assert.ok(c.stt > 0);
    assert.ok(c.brokerage <= 20);
    assert.equal(sumChargeBreakdown(c), c.total);
  });
});

describe("cashFlowForTrade", () => {
  it("buy cash flow exceeds turnover", () => {
    const charges = computeZerodhaCharges({
      side: "BUY",
      qty: 1,
      price: 1000,
      product: "CNC",
    });
    const flow = cashFlowForTrade("BUY", 1000, charges);
    assert.ok(flow > 1000);
  });
});
