import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { OrderRecord, PaperTrade } from "@/lib/firebase";
import {
  mergePaperFills,
  mergePaperOrderRecords,
  normalizePaperTrades,
} from "./normalize";

function trade(
  partial: Partial<PaperTrade> & Pick<PaperTrade, "id" | "side" | "qty" | "price">
): PaperTrade {
  return {
    time: "10 Aug 2026, 10:00:00",
    symbol: "TCS",
    exchange: "NSE",
    date: "2026-08-10",
    executedAt: "2026-08-10T04:30:00.000Z",
    ...partial,
  };
}

function order(
  partial: Partial<OrderRecord> & Pick<OrderRecord, "id" | "side" | "qty" | "price">
): OrderRecord {
  return {
    time: "2026-08-10 10:00:00",
    symbol: "TCS",
    exchange: "NSE",
    orderType: "MARKET",
    product: "CNC",
    mode: "PAPER",
    status: "EXECUTED",
    date: "2026-08-10",
    ...partial,
  };
}

describe("mergePaperFills", () => {
  it("includes order-only fills missing from paper trades", () => {
    const trades = [
      trade({
        id: "t1",
        side: "BUY",
        qty: 1,
        price: 4000,
        strategyName: "MACD",
      }),
    ];
    const orders = [
      order({
        id: "t1",
        side: "BUY",
        qty: 1,
        price: 4000,
        strategyName: "MACD",
      }),
      order({
        id: "orphan-sell",
        side: "SELL",
        qty: 1,
        price: 4100,
        symbol: "INFY",
        strategyName: "Risk",
        date: "2026-08-09",
        time: "2026-08-09 11:00:00",
      }),
    ];

    const paperOnly = normalizePaperTrades(trades, orders);
    assert.equal(paperOnly.length, 1);

    const merged = mergePaperFills(trades, orders);
    assert.equal(merged.length, 2);
    assert.ok(merged.some((t) => t.symbol === "INFY" && t.side === "SELL"));
  });

  it("keeps Paper Trading and Orders counts identical", () => {
    const trades = [
      trade({ id: "a", side: "BUY", qty: 10, price: 100, strategyName: "A" }),
      trade({ id: "b", side: "SELL", qty: 10, price: 110, strategyName: "A" }),
    ];
    const orders = [
      order({ id: "a", side: "BUY", qty: 10, price: 100, strategyName: "A" }),
      order({ id: "b", side: "SELL", qty: 10, price: 110, strategyName: "A" }),
      order({
        id: "c",
        side: "BUY",
        qty: 5,
        price: 200,
        symbol: "HDFCLIFE",
        strategyName: "B",
        date: "2026-08-07",
        time: "2026-08-07 10:00:00",
      }),
      order({
        id: "live-1",
        side: "BUY",
        qty: 1,
        price: 1,
        mode: "LIVE",
        symbol: "RELIANCE",
      }),
    ];

    const fills = mergePaperFills(trades, orders);
    const orderRows = mergePaperOrderRecords(trades, orders);
    assert.equal(fills.length, orderRows.length);
    assert.equal(fills.length, 3);
    assert.equal(orderRows.every((o) => o.mode === "PAPER"), true);
  });
});
