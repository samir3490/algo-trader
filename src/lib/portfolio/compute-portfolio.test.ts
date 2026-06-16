import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeInvested,
  computePortfolio,
  computeTodayPnl,
  computeRealizedPnl,
  computePnlBreakdown,
  isTradeTodayIST,
  todayDateKeyIST,
} from "./compute-portfolio";
import type { PaperTrade } from "@/lib/firebase";

describe("computePortfolio", () => {
  it("uses avgPrice when ltp is zero so invested is not shown as total loss", () => {
    const summary = computePortfolio(
      [{ symbol: "RELIANCE", exchange: "NSE", qty: 10, avgPrice: 2500, ltp: 0 }],
      500_000
    );
    assert.equal(summary.invested, 25_000);
    assert.equal(summary.currentValue, 25_000);
    assert.equal(summary.pnl, 0);
    assert.equal(summary.portfolioValue, 525_000);
  });

  it("computes mark-to-market pnl when ltp is set", () => {
    const summary = computePortfolio(
      [{ symbol: "TCS", exchange: "NSE", qty: 5, avgPrice: 4000, ltp: 4200 }],
      1_000_000
    );
    assert.equal(summary.pnl, 1000);
    assert.ok(Math.abs(summary.pnlPercent - 5) < 0.1);
  });
});

describe("computeTodayPnl", () => {
  const today = todayDateKeyIST();

  it("does not treat buy notional as loss", () => {
    const trades: PaperTrade[] = [
      {
        id: "t1",
        time: "10:00:00",
        date: today,
        symbol: "INFY",
        exchange: "NSE",
        side: "BUY",
        qty: 100,
        price: 1500,
      },
    ];
    const result = computeTodayPnl(trades, [
      { symbol: "INFY", exchange: "NSE", qty: 100, avgPrice: 1500, ltp: 1550 },
    ]);
    assert.equal(result.pnl, 0);
    assert.equal(result.mode, "none");
    assert.equal(result.tradeCount, 1);
  });

  it("sums realized netPnl from sells today", () => {
    const trades: PaperTrade[] = [
      {
        id: "t2",
        time: "11:00:00",
        date: today,
        symbol: "INFY",
        exchange: "NSE",
        side: "SELL",
        qty: 50,
        price: 1600,
        netPnl: 2500,
      },
    ];
    const result = computeTodayPnl(trades, []);
    assert.equal(result.pnl, 2500);
    assert.equal(result.mode, "realized");
  });
});

describe("isTradeTodayIST", () => {
  it("matches executedAt in IST", () => {
    const today = todayDateKeyIST();
    const trade: PaperTrade = {
      id: "t3",
      time: "12:00:00",
      executedAt: new Date().toISOString(),
      symbol: "SBIN",
      exchange: "NSE",
      side: "BUY",
      qty: 1,
      price: 100,
    };
    assert.equal(isTradeTodayIST(trade, today), true);
  });
});

describe("computeRealizedPnl", () => {
  it("sums netPnl from sell trades only", () => {
    const trades: PaperTrade[] = [
      {
        id: "1",
        time: "x",
        symbol: "TCS",
        exchange: "NSE",
        side: "SELL",
        qty: 10,
        price: 4000,
        netPnl: 1500,
      },
      {
        id: "2",
        time: "x",
        symbol: "INFY",
        exchange: "NSE",
        side: "SELL",
        qty: 5,
        price: 1800,
        netPnl: -200,
      },
      {
        id: "3",
        time: "x",
        symbol: "RELIANCE",
        exchange: "NSE",
        side: "BUY",
        qty: 1,
        price: 2500,
      },
    ];
    assert.equal(computeRealizedPnl(trades), 1300);
  });
});

describe("computePnlBreakdown", () => {
  it("aligns unrealized, realized, and all-time figures", () => {
    const trades: PaperTrade[] = [
      {
        id: "s1",
        time: "x",
        symbol: "TCS",
        exchange: "NSE",
        side: "SELL",
        qty: 5,
        price: 4200,
        netPnl: 1000,
      },
    ];
    const breakdown = computePnlBreakdown(
      trades,
      [{ symbol: "INFY", exchange: "NSE", qty: 10, avgPrice: 1500, ltp: 1550 }],
      900_000,
      1_000_000
    );
    assert.equal(breakdown.realizedPnl, 1000);
    assert.equal(breakdown.unrealizedPnl, 500);
    assert.equal(breakdown.allTimePnl, breakdown.portfolio.portfolioValue - 1_000_000);
  });
});

describe("computeInvested", () => {
  it("ignores negative qty/price edge cases", () => {
    assert.equal(
      computeInvested([
        { symbol: "X", exchange: "NSE", qty: -1, avgPrice: 100, ltp: 100 },
      ]),
      0
    );
  });
});
