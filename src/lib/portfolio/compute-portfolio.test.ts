import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPortfolioChart,
  computeInvested,
  computePortfolio,
  computeTodayPnl,
  computeRealizedPnl,
  computeFifoRealizedPnl,
  computePnlBreakdown,
  deriveHonestCash,
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

  it("portfolio value excludes unrealized mark-to-market gains", () => {
    const summary = computePortfolio(
      [{ symbol: "TCS", exchange: "NSE", qty: 5, avgPrice: 4000, ltp: 4200 }],
      980_000
    );
    assert.equal(summary.invested, 20_000);
    assert.equal(summary.currentValue, 21_000);
    assert.equal(summary.pnl, 1000);
    assert.equal(summary.portfolioValue, 1_000_000);
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

describe("computeFifoRealizedPnl", () => {
  it("matches buys to sells and ignores orphan sells", () => {
    const trades: PaperTrade[] = [
      {
        id: "b1",
        time: "x",
        date: "2026-10-01",
        executedAt: "2026-10-01T04:00:00.000Z",
        symbol: "TCS",
        exchange: "NSE",
        side: "BUY",
        qty: 10,
        price: 100,
      },
      {
        id: "s1",
        time: "y",
        date: "2026-10-02",
        executedAt: "2026-10-02T04:00:00.000Z",
        symbol: "TCS",
        exchange: "NSE",
        side: "SELL",
        qty: 10,
        price: 110,
        netPnl: 9999,
      },
      {
        id: "orphan",
        time: "z",
        date: "2026-10-03",
        executedAt: "2026-10-03T04:00:00.000Z",
        symbol: "INFY",
        exchange: "NSE",
        side: "SELL",
        qty: 50,
        price: 1500,
        netPnl: 50_000,
      },
    ];
    assert.equal(computeFifoRealizedPnl(trades), 100);
    assert.equal(computeRealizedPnl(trades), 59_999);
  });
});

describe("deriveHonestCash", () => {
  it("is start minus invested plus realized", () => {
    assert.equal(deriveHonestCash(1_000_000, 100_000, -5_000), 895_000);
  });
});

describe("computePnlBreakdown", () => {
  it("trusts stored cash by default; truncation cannot change all-time P&L", () => {
    const trades: PaperTrade[] = [
      {
        id: "b1",
        time: "x",
        date: "2026-10-01",
        executedAt: "2026-10-01T04:00:00.000Z",
        symbol: "TCS",
        exchange: "NSE",
        side: "BUY",
        qty: 10,
        price: 100,
      },
      {
        id: "s1",
        time: "y",
        date: "2026-10-02",
        executedAt: "2026-10-02T04:00:00.000Z",
        symbol: "TCS",
        exchange: "NSE",
        side: "SELL",
        qty: 10,
        price: 110,
        netPnl: 100,
      },
      {
        id: "orphan",
        time: "z",
        date: "2026-10-03",
        executedAt: "2026-10-03T04:00:00.000Z",
        symbol: "WIPRO",
        exchange: "NSE",
        side: "SELL",
        qty: 100,
        price: 500,
        netPnl: 200_000,
      },
    ];
    const holdings = [
      { symbol: "INFY", exchange: "NSE", qty: 10, avgPrice: 1500, ltp: 1550 },
    ];
    // Default: trust stored cash so truncated/orphan history cannot rewrite money.
    const breakdown = computePnlBreakdown(trades, holdings, 1_200_000, 1_000_000);
    assert.equal(breakdown.portfolio.balance, 1_200_000);
    assert.equal(breakdown.unrealizedPnl, 500);
    assert.equal(breakdown.portfolio.invested, 15_000);
    assert.equal(breakdown.cashRepaired, false);
    assert.equal(breakdown.realizedPnl, 1_200_000 - 1_000_000 + 15_000);
    assert.equal(breakdown.allTimePnl, 1_200_000 + 15_500 - 1_000_000);

    // Truncating old sells must not change all-time when cash/holdings are fixed.
    const truncated = trades.filter((t) => t.id !== "s1");
    const truncatedBreakdown = computePnlBreakdown(
      truncated,
      holdings,
      1_200_000,
      1_000_000
    );
    assert.equal(truncatedBreakdown.allTimePnl, breakdown.allTimePnl);
    assert.equal(truncatedBreakdown.portfolio.balance, breakdown.portfolio.balance);

    // Legacy FIFO reconstruct still available when explicitly requested.
    const legacy = computePnlBreakdown(trades, holdings, 1_200_000, 1_000_000, {
      reconstructCashFromTrades: true,
    });
    assert.equal(legacy.realizedPnl, 100);
    assert.equal(legacy.portfolio.balance, 985_100);
    assert.equal(legacy.cashRepaired, true);
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

describe("buildPortfolioChart", () => {
  function trade(
    id: string,
    dateIST: string,
    side: "BUY" | "SELL",
    qty: number,
    price: number,
    extra: Partial<PaperTrade> = {}
  ): PaperTrade {
    return {
      id,
      time: "10:00:00",
      date: dateIST,
      executedAt: `${dateIST}T10:00:00+05:30`,
      symbol: "INFY",
      exchange: "NSE",
      side,
      qty,
      price,
      ...extra,
    };
  }

  it("week window is 7 daily points", () => {
    const trades = [
      trade("b1", "2026-07-01", "BUY", 10, 1000),
      trade("s1", "2026-08-03", "SELL", 10, 1100, { netPnl: 1000 }),
    ];
    const now = new Date("2026-08-05T12:00:00+05:30");
    const week = buildPortfolioChart(trades, 1_001_000, [], 1_000_000, "week", now);
    assert.equal(week.length, 7);
    assert.equal(week[week.length - 1].value, 1_001_000);
  });

  it("defaults to full history (all) from first trade", () => {
    const trades = [
      trade("b1", "2026-07-01", "BUY", 10, 1000),
      trade("s1", "2026-08-03", "SELL", 10, 1100, { netPnl: 1000 }),
    ];
    const now = new Date("2026-08-05T12:00:00+05:30");
    const all = buildPortfolioChart(trades, 1_001_000, [], 1_000_000, "all", now);
    // 2026-07-01 → 2026-08-05 inclusive = 36 days
    assert.equal(all.length, 36);
    assert.equal(all[all.length - 1].value, 1_001_000);
  });

  it("uses daily points for month and monthly points for year", () => {
    const trades = [
      trade("b1", "2026-01-15", "BUY", 10, 1000),
      trade("s1", "2026-06-10", "SELL", 10, 1200, { netPnl: 2000 }),
    ];
    const now = new Date("2026-08-05T12:00:00+05:30");
    const month = buildPortfolioChart(trades, 1_002_000, [], 1_000_000, "month", now);
    const year = buildPortfolioChart(trades, 1_002_000, [], 1_000_000, "year", now);
    assert.equal(month.length, 30);
    assert.ok(year.length >= 8 && year.length <= 13);
    assert.equal(year[year.length - 1].value, 1_002_000);
  });
});
