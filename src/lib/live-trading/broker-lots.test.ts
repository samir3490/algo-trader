import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findSellLot,
  holdingSellableQty,
  lotsFromKiteHoldings,
  lotsFromKitePositions,
} from "./broker-lots";

describe("holdingSellableQty", () => {
  it("includes t1_quantity like the holdings UI", () => {
    assert.equal(holdingSellableQty({ quantity: 0, t1_quantity: 10 }), 10);
    assert.equal(holdingSellableQty({ quantity: 5, t1_quantity: 3 }), 8);
    assert.equal(holdingSellableQty({ quantity: 7 }), 7);
  });
});

describe("lotsFromKiteHoldings", () => {
  it("builds AXISBANK lot from T1-only holding", () => {
    const lots = lotsFromKiteHoldings([
      {
        tradingsymbol: "AXISBANK",
        exchange: "NSE",
        quantity: 0,
        t1_quantity: 4,
        average_price: 1200,
        last_price: 1170,
      },
    ]);
    assert.equal(lots.length, 1);
    assert.equal(lots[0].symbol, "AXISBANK");
    assert.equal(lots[0].qty, 4);
    assert.equal(lots[0].avgPrice, 1200);
    assert.equal(lots[0].ltp, 1170);
    assert.equal(lots[0].product, "CNC");
  });
});

describe("lotsFromKitePositions + findSellLot", () => {
  it("prefers matching product then falls back", () => {
    const lots = [
      ...lotsFromKitePositions({
        net: [
          {
            tradingsymbol: "AXISBANK",
            exchange: "NSE",
            quantity: 2,
            product: "MIS",
            average_price: 1100,
            last_price: 1080,
          },
        ],
      }),
      ...lotsFromKiteHoldings([
        {
          tradingsymbol: "AXISBANK",
          exchange: "NSE",
          quantity: 4,
          t1_quantity: 0,
          average_price: 1200,
          last_price: 1170,
        },
      ]),
    ];
    const cnc = findSellLot(lots, "AXISBANK", "CNC");
    assert.equal(cnc?.qty, 4);
    assert.equal(cnc?.product, "CNC");
    const mis = findSellLot(lots, "AXISBANK", "MIS");
    assert.equal(mis?.qty, 2);
    assert.equal(mis?.product, "MIS");
  });
});
