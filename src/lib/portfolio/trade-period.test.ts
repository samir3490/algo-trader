import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PaperTrade } from "@/lib/firebase";
import { resolveTradeCharges } from "@/lib/brokerage/trade-charges";
import {
  attachFifoNetPnl,
  computeFifoRealizedPnlInRange,
  computeTradePeriodTotals,
  filterTradesByDateRange,
  resolveTradeDateRange,
  tradePeriodLabel,
} from "./trade-period";

function trade(
  partial: Partial<PaperTrade> &
    Pick<PaperTrade, "id" | "symbol" | "side" | "qty" | "price" | "executedAt">
): PaperTrade {
  return {
    exchange: "NSE",
    time: "",
    date: partial.executedAt?.slice(0, 10),
    ...partial,
  } as PaperTrade;
}

describe("resolveTradeDateRange", () => {
  const now = new Date("2026-11-17T12:00:00+05:30");

  it("resolves week / month / year / all", () => {
    assert.deepEqual(resolveTradeDateRange("week", now), {
      fromKey: "2026-11-11",
      toKey: "2026-11-17",
    });
    assert.deepEqual(resolveTradeDateRange("month", now), {
      fromKey: "2026-10-19",
      toKey: "2026-11-17",
    });
    assert.equal(resolveTradeDateRange("year", now).toKey, "2026-11-17");
    assert.deepEqual(resolveTradeDateRange("all", now), {
      fromKey: null,
      toKey: null,
    });
  });

  it("accepts custom YYYY-MM-DD bounds", () => {
    assert.deepEqual(
      resolveTradeDateRange("custom", now, {
        from: "2026-11-01",
        to: "2026-11-10",
      }),
      { fromKey: "2026-11-01", toKey: "2026-11-10" }
    );
  });
});

describe("filterTradesByDateRange", () => {
  const trades = [
    trade({
      id: "1",
      symbol: "AAA",
      side: "BUY",
      qty: 10,
      price: 100,
      executedAt: "2026-11-01T10:00:00+05:30",
    }),
    trade({
      id: "2",
      symbol: "AAA",
      side: "SELL",
      qty: 10,
      price: 110,
      executedAt: "2026-11-15T10:00:00+05:30",
    }),
  ];

  it("filters inclusive IST dates", () => {
    const filtered = filterTradesByDateRange(trades, {
      fromKey: "2026-11-10",
      toKey: "2026-11-17",
    });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, "2");
  });
});

describe("computeFifoRealizedPnlInRange", () => {
  it("attributes sell P&L to the sell date even when buy is outside range", () => {
    const trades = [
      trade({
        id: "b",
        symbol: "AAA",
        side: "BUY",
        qty: 10,
        price: 100,
        executedAt: "2026-10-01T10:00:00+05:30",
      }),
      trade({
        id: "s",
        symbol: "AAA",
        side: "SELL",
        qty: 10,
        price: 120,
        executedAt: "2026-11-15T10:00:00+05:30",
      }),
    ];
    const inWeek = computeFifoRealizedPnlInRange(trades, {
      fromKey: "2026-11-11",
      toKey: "2026-11-17",
    });
    assert.equal(inWeek.realizedPnl, 200);
    assert.equal(inWeek.wins, 1);

    const before = computeFifoRealizedPnlInRange(trades, {
      fromKey: "2026-10-01",
      toKey: "2026-10-31",
    });
    assert.equal(before.realizedPnl, 0);
  });
});

describe("attachFifoNetPnl", () => {
  it("fills missing netPnl on sells from FIFO cost basis", () => {
    const trades = [
      trade({
        id: "b",
        symbol: "AAA",
        side: "BUY",
        qty: 10,
        price: 100,
        executedAt: "2026-11-12T10:00:00+05:30",
      }),
      trade({
        id: "s",
        symbol: "AAA",
        side: "SELL",
        qty: 10,
        price: 110,
        executedAt: "2026-11-14T10:00:00+05:30",
      }),
    ];
    const withPnl = attachFifoNetPnl(trades);
    assert.equal(withPnl[0].netPnl, undefined);
    assert.equal(withPnl[1].netPnl, 100);
  });
});

describe("computeTradePeriodTotals", () => {
  it("sums turnover and period realized", () => {
    const trades = [
      trade({
        id: "b",
        symbol: "AAA",
        side: "BUY",
        qty: 10,
        price: 100,
        executedAt: "2026-11-12T10:00:00+05:30",
        charges: 5,
      }),
      trade({
        id: "s",
        symbol: "AAA",
        side: "SELL",
        qty: 10,
        price: 90,
        executedAt: "2026-11-14T10:00:00+05:30",
        charges: 5,
      }),
    ];
    const totals = computeTradePeriodTotals(trades, {
      fromKey: "2026-11-11",
      toKey: "2026-11-17",
    });
    assert.equal(totals.tradeCount, 2);
    assert.equal(totals.buyCount, 1);
    assert.equal(totals.sellCount, 1);
    assert.equal(totals.buyTurnover, 1000);
    assert.equal(totals.sellTurnover, 900);
    assert.equal(totals.realizedPnl, -110);
    assert.equal(totals.losses, 1);
    const expectedFees =
      resolveTradeCharges(trades[0]).total + resolveTradeCharges(trades[1]).total;
    assert.equal(totals.fees, Math.round(expectedFees * 100) / 100);
    assert.equal(totals.feesEstimated, false);
    assert.equal(
      tradePeriodLabel("week", { fromKey: "2026-11-11", toKey: "2026-11-17" }),
      "Last 7 days (IST)"
    );
  });

  it("estimates fees when charges are missing on trades", () => {
    const trades = [
      trade({
        id: "b",
        symbol: "AAA",
        side: "BUY",
        qty: 10,
        price: 100,
        executedAt: "2026-11-12T10:00:00+05:30",
      }),
      trade({
        id: "s",
        symbol: "AAA",
        side: "SELL",
        qty: 10,
        price: 110,
        executedAt: "2026-11-14T10:00:00+05:30",
      }),
    ];
    const totals = computeTradePeriodTotals(trades, {
      fromKey: "2026-11-11",
      toKey: "2026-11-17",
    });
    assert.ok(totals.fees > 0);
    assert.equal(totals.feesEstimated, true);
  });
});
