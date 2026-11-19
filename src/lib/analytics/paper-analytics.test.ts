import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PaperTrade } from "@/lib/firebase";
import {
  aggregateEquityCurveByMonth,
  computePaperPortfolioAnalytics,
  extractRoundTrips,
  formatMonthKeyLabel,
} from "./paper-analytics";
import type { EquityPoint } from "./risk-metrics";

function trade(
  partial: Partial<PaperTrade> &
    Pick<PaperTrade, "id" | "side" | "symbol" | "qty" | "price" | "date">
): PaperTrade {
  return {
    time: `${partial.date}T10:00:00+05:30`,
    executedAt: `${partial.date}T10:00:00.000+05:30`,
    exchange: "NSE",
    ...partial,
  };
}

describe("paper-analytics round trips", () => {
  it("fills missing sell netPnl via FIFO for monthly totals", () => {
    const trades = [
      trade({
        id: "b1",
        side: "BUY",
        symbol: "TCS",
        qty: 10,
        price: 1000,
        date: "2026-07-05",
      }),
      trade({
        id: "s1",
        side: "SELL",
        symbol: "TCS",
        qty: 10,
        price: 1100,
        date: "2026-07-20",
        // netPnl intentionally omitted — previously showed ₹0 for the month
      }),
      trade({
        id: "b2",
        side: "BUY",
        symbol: "INFY",
        qty: 5,
        price: 1400,
        date: "2026-10-02",
      }),
      trade({
        id: "s2",
        side: "SELL",
        symbol: "INFY",
        qty: 5,
        price: 1500,
        date: "2026-10-18",
      }),
    ];
    const trips = extractRoundTrips(trades);
    assert.equal(trips.length, 2);
    assert.equal(trips[0].pnl, 1000);
    assert.equal(trips[1].pnl, 500);
    const jul = trips.filter((t) =>
      new Date(t.closedAtMs).toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
      }).startsWith("2026-07")
    );
    const oct = trips.filter((t) =>
      new Date(t.closedAtMs).toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
      }).startsWith("2026-10")
    );
    assert.equal(jul.reduce((s, t) => s + t.pnl, 0), 1000);
    assert.equal(oct.reduce((s, t) => s + t.pnl, 0), 500);
  });
});

describe("aggregateEquityCurveByMonth", () => {
  it("keeps last equity per month and formats labels", () => {
    const curve: EquityPoint[] = [
      { timestamp: "2026-07-01T10:00:00.000Z", ms: Date.parse("2026-07-01T10:00:00+05:30"), equity: 1_000_000 },
      { timestamp: "2026-07-20T10:00:00.000Z", ms: Date.parse("2026-07-20T10:00:00+05:30"), equity: 1_010_000 },
      { timestamp: "2026-10-18T10:00:00.000Z", ms: Date.parse("2026-10-18T10:00:00+05:30"), equity: 1_015_000 },
    ];
    const months = aggregateEquityCurveByMonth(curve);
    assert.equal(months.length, 2);
    assert.equal(months[0].month, "2026-07");
    assert.equal(months[0].equity, 1_010_000);
    assert.equal(months[1].month, "2026-10");
    assert.equal(formatMonthKeyLabel("2026-07"), "Jul 2026");
  });
});

describe("computePaperPortfolioAnalytics net P&L", () => {
  it("excludes open unrealized mark-to-market from overall net P&L", () => {
    const trades = [
      trade({
        id: "b1",
        side: "BUY",
        symbol: "TCS",
        qty: 10,
        price: 1000,
        date: "2026-06-01",
      }),
      trade({
        id: "s1",
        side: "SELL",
        symbol: "TCS",
        qty: 10,
        price: 1100,
        date: "2026-06-15",
        netPnl: 1000,
      }),
      trade({
        id: "b2",
        side: "BUY",
        symbol: "INFY",
        qty: 10,
        price: 1500,
        date: "2026-07-01",
      }),
    ];
    // Open INFY is +₹5,000 unrealized; closed TCS realized is +₹1,000.
    const holdings = [
      { symbol: "INFY", exchange: "NSE", qty: 10, avgPrice: 1500, ltp: 2000 },
    ];
    // Cash identity would be: 985_000 - 1_000_000 + 15_000 = 0, or if cash
    // were wrongly marked it could absorb the +5k — Net must stay at FIFO 1000.
    const analytics = computePaperPortfolioAnalytics(
      trades,
      holdings,
      985_000,
      1_000_000
    );
    assert.equal(analytics.overall.netPnl, 1000);
    assert.equal(analytics.pnlBreakdown.realizedPnl, 1000);
    assert.equal(analytics.pnlBreakdown.unrealizedPnl, 5000);
    // Must not equal all-time (realized + unrealized).
    assert.notEqual(
      analytics.overall.netPnl,
      analytics.pnlBreakdown.realizedPnl + analytics.pnlBreakdown.unrealizedPnl
    );
  });
});
