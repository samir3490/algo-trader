import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OrderRecord } from "@/lib/firebase";
import {
  buildMonthlyLivePerformanceReport,
  previousMonthRangeIST,
  shouldSendMonthlyLiveEmail,
} from "./monthly-live-performance";

describe("monthly-live-performance", () => {
  it("previousMonthRangeIST returns October when now is 1 Nov IST", () => {
    const now = new Date("2026-11-01T04:00:00.000Z"); // 09:30 IST
    const range = previousMonthRangeIST(now);
    assert.equal(range.monthKey, "2026-10");
    assert.equal(range.fromKey, "2026-10-01");
    assert.equal(range.toKey, "2026-10-31");
  });

  it("shouldSendMonthlyLiveEmail dedupes by month key", () => {
    assert.equal(shouldSendMonthlyLiveEmail(undefined, "2026-10"), true);
    assert.equal(shouldSendMonthlyLiveEmail("2026-10", "2026-10"), false);
    assert.equal(shouldSendMonthlyLiveEmail("2026-09", "2026-10"), true);
  });

  it("buildMonthlyLivePerformanceReport counts prior-month LIVE fills", () => {
    const now = new Date("2026-11-01T04:00:00.000Z");
    const orders: OrderRecord[] = [
      {
        id: "live-1",
        time: "2026-10-15T10:00:00+05:30",
        symbol: "SBIN",
        exchange: "NSE",
        side: "BUY",
        qty: 1,
        price: 800,
        orderType: "MARKET",
        product: "CNC",
        mode: "LIVE",
        status: "COMPLETE",
        date: "2026-10-15",
        strategyName: "VWAP Reversion",
      },
      {
        id: "live-2",
        time: "2026-10-20T11:00:00+05:30",
        symbol: "SBIN",
        exchange: "NSE",
        side: "SELL",
        qty: 1,
        price: 850,
        orderType: "MARKET",
        product: "CNC",
        mode: "LIVE",
        status: "COMPLETE",
        date: "2026-10-20",
        strategyName: "VWAP Reversion",
      },
      {
        id: "paper-1",
        time: "2026-10-15T10:00:00+05:30",
        symbol: "INFY",
        exchange: "NSE",
        side: "BUY",
        qty: 1,
        price: 1500,
        orderType: "MARKET",
        product: "CNC",
        mode: "PAPER",
        status: "EXECUTED",
        date: "2026-10-15",
      },
    ];

    const report = buildMonthlyLivePerformanceReport(orders, now);
    assert.equal(report.monthKey, "2026-10");
    assert.equal(report.tradeCount, 2);
    assert.equal(report.buyCount, 1);
    assert.equal(report.sellCount, 1);
    assert.equal(report.realizedPnl, 50);
    assert.equal(report.topStrategies[0]?.strategyName, "VWAP Reversion");
    assert.equal(report.topSymbols[0]?.symbol, "SBIN");
  });
});
