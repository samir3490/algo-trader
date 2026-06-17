import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeZerodhaCharges,
  sumChargeBreakdown,
} from "./zerodha-charges";
import { resolveTradeCharges } from "./trade-charges";
import type { PaperTrade } from "@/lib/firebase";

describe("sumChargeBreakdown", () => {
  it("equals total from computeZerodhaCharges", () => {
    const c = computeZerodhaCharges({
      side: "BUY",
      qty: 50,
      price: 2500,
      product: "CNC",
    });
    assert.equal(sumChargeBreakdown(c), c.total);
  });
});

describe("resolveTradeCharges", () => {
  it("fills missing exchange/stamp legs so columns sum to total", () => {
    const trade: PaperTrade = {
      id: "t1",
      time: "x",
      symbol: "RELIANCE",
      exchange: "NSE",
      side: "BUY",
      qty: 10,
      price: 2500,
      charges: 150,
      brokerage: 0,
      stt: 25,
      gst: 0.5,
    };
    const c = resolveTradeCharges(trade);
    assert.equal(sumChargeBreakdown(c), c.total);
    assert.ok(c.exchangeCharges > 0 || c.stampDuty > 0);
  });
});
