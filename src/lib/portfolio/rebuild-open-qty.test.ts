import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { OrderRecord, PaperTrade, PaperTradingState } from "@/lib/firebase";
import { rebuildOpenQtyFromFills } from "./rebuild-open-qty";
import { prunePaperStateForScan } from "./paper-state-cleanup";

function trade(
  partial: Partial<PaperTrade> &
    Pick<PaperTrade, "id" | "side" | "qty" | "price" | "date">
): PaperTrade {
  return {
    time: `${partial.date} 10:00:00`,
    symbol: "HDFCLIFE",
    exchange: "NSE",
    executedAt: `${partial.date}T04:30:00.000Z`,
    ...partial,
  };
}

describe("rebuildOpenQtyFromFills", () => {
  it("fixes HDFCLIFE qty after 3 buys and 1 sell when the open lot was not updated", () => {
    const trades: PaperTrade[] = [
      trade({ id: "b1", side: "BUY", qty: 10, price: 700, date: "2026-08-07" }),
      trade({ id: "b2", side: "BUY", qty: 12, price: 720, date: "2026-08-08" }),
      trade({
        id: "s1",
        side: "SELL",
        qty: 10,
        price: 740,
        date: "2026-08-09",
      }),
      trade({ id: "b3", side: "BUY", qty: 11, price: 760, date: "2026-08-10" }),
    ];
    const state: PaperTradingState = {
      balance: 900_000,
      positions: [
        {
          id: "p-hdfc",
          symbol: "HDFCLIFE",
          exchange: "NSE",
          quantity: 10,
          entryPrice: 700,
          ltp: 760,
          ownerStrategyId: "macd-1",
          ownerStrategyName: "MACD",
          state: "OPEN",
          entryTime: "2026-08-07T04:30:00.000Z",
        },
      ],
      holdings: [
        {
          symbol: "HDFCLIFE",
          exchange: "NSE",
          qty: 10,
          avgPrice: 700,
          ltp: 760,
        },
      ],
      trades,
    };

    const out = rebuildOpenQtyFromFills(state);
    const holding = out.holdings?.find((h) => h.symbol === "HDFCLIFE");
    // FIFO: sell consumes first 10; remaining 12 + 11 = 23
    assert.equal(holding?.qty, 23);
    assert.equal(
      holding?.avgPrice,
      Math.round(((12 * 720 + 11 * 760) / 23) * 100) / 100
    );
  });

  it("applies an order-only add-on buy that never made it into trades", () => {
    const state: PaperTradingState = {
      balance: 900_000,
      positions: [
        {
          id: "p-hdfc",
          symbol: "HDFCLIFE",
          exchange: "NSE",
          quantity: 10,
          entryPrice: 700,
          ltp: 760,
          ownerStrategyId: "s1",
          state: "OPEN",
          entryTime: "2026-08-07T04:30:00.000Z",
        },
      ],
      holdings: [
        {
          symbol: "HDFCLIFE",
          exchange: "NSE",
          qty: 10,
          avgPrice: 700,
          ltp: 760,
        },
      ],
      trades: [
        trade({ id: "b1", side: "BUY", qty: 10, price: 700, date: "2026-08-07" }),
      ],
    };
    const orders: OrderRecord[] = [
      {
        id: "b1",
        time: "2026-08-07 10:00:00",
        symbol: "HDFCLIFE",
        exchange: "NSE",
        side: "BUY",
        qty: 10,
        price: 700,
        orderType: "MARKET",
        product: "CNC",
        mode: "PAPER",
        status: "EXECUTED",
        date: "2026-08-07",
      },
      {
        id: "b-aug10",
        time: "2026-08-10 10:15:00",
        symbol: "HDFCLIFE",
        exchange: "NSE",
        side: "BUY",
        qty: 11,
        price: 760,
        orderType: "MARKET",
        product: "CNC",
        mode: "PAPER",
        status: "EXECUTED",
        date: "2026-08-10",
      },
    ];

    const out = prunePaperStateForScan(state, orders);
    assert.equal(out.holdings?.[0]?.qty, 21);
    assert.equal(out.positions?.length, 1);
  });

  it("does not close a holding when trade history has no buys", () => {
    const state: PaperTradingState = {
      balance: 900_000,
      positions: [
        {
          id: "p1",
          symbol: "INFY",
          exchange: "NSE",
          quantity: 5,
          entryPrice: 1500,
          ltp: 1510,
          ownerStrategyId: "s1",
          state: "OPEN",
          entryTime: "2026-01-01T00:00:00.000Z",
        },
      ],
      holdings: [
        { symbol: "INFY", exchange: "NSE", qty: 5, avgPrice: 1500, ltp: 1510 },
      ],
      trades: [],
    };
    const out = rebuildOpenQtyFromFills(state);
    assert.equal(out.positions?.[0]?.quantity, 5);
    assert.equal(out.holdings?.[0]?.qty, 5);
  });
});
