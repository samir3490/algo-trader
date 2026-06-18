import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canExecuteStrategyTrade } from "./portfolio-gate";
import { DEFAULT_SETTINGS } from "@/lib/firebase";
import type { PaperTrade } from "@/lib/firebase";
import { OWNER_MANUAL } from "@/lib/portfolio/types";

const settings = { ...DEFAULT_SETTINGS, rebuyCooldownMinutes: 240 };
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

describe("canExecuteStrategyTrade", () => {
  it("blocks BUY when soldThisRun", () => {
    const sold = new Set(["SAIL:NSE"]);
    const r = canExecuteStrategyTrade("BUY", "SAIL", "NSE", {
      holdings: [],
      trades: [],
      settings,
      soldThisRun: sold,
    });
    assert.equal(r.allowed, false);
    assert.match(r.reason ?? "", /Sold this scan/);
  });

  it("blocks BUY after losing same-day sell", () => {
    const trades: PaperTrade[] = [
      {
        id: "1",
        time: "x",
        symbol: "SAIL",
        exchange: "NSE",
        side: "SELL",
        qty: 1,
        price: 90,
        netPnl: -50,
        date: today,
        executedAt: new Date().toISOString(),
      },
    ];
    const r = canExecuteStrategyTrade("BUY", "SAIL", "NSE", {
      holdings: [],
      trades,
      settings,
      soldThisRun: new Set(),
    });
    assert.equal(r.allowed, false);
    assert.match(r.reason ?? "", /Sold today|loss/);
  });

  it("blocks BUY when symbol locked for today", () => {
    const r = canExecuteStrategyTrade("BUY", "POLICYBAZAAR", "NSE", {
      holdings: [],
      trades: [],
      settings,
      soldThisRun: new Set(),
      symbolsLockedToday: { "POLICYBAZAAR:NSE": today },
    });
    assert.equal(r.allowed, false);
    assert.match(r.reason ?? "", /locked/);
  });

  it("blocks duplicate BUY on same symbol same day", () => {
    const trades: PaperTrade[] = [
      {
        id: "1",
        time: "x",
        symbol: "HINDALCO",
        exchange: "NSE",
        side: "BUY",
        qty: 10,
        price: 700,
        date: today,
        executedAt: new Date().toISOString(),
      },
    ];
    const r = canExecuteStrategyTrade("BUY", "HINDALCO", "NSE", {
      holdings: [],
      trades,
      settings,
      soldThisRun: new Set(),
    });
    assert.equal(r.allowed, false);
    assert.match(r.reason ?? "", /Already bought this symbol today/);
  });

  it("blocks same-day rebuy after sell", () => {
    const trades: PaperTrade[] = [
      {
        id: "1",
        time: "x",
        symbol: "HINDALCO",
        exchange: "NSE",
        side: "BUY",
        qty: 10,
        price: 700,
        date: today,
        executedAt: new Date(Date.now() - 3_600_000).toISOString(),
      },
      {
        id: "2",
        time: "y",
        symbol: "HINDALCO",
        exchange: "NSE",
        side: "SELL",
        qty: 10,
        price: 710,
        date: today,
        executedAt: new Date().toISOString(),
      },
    ];
    const r = canExecuteStrategyTrade("BUY", "HINDALCO", "NSE", {
      holdings: [],
      trades,
      settings,
      soldThisRun: new Set(),
    });
    assert.equal(r.allowed, false);
    assert.match(r.reason ?? "", /Sold today|rebuy|Already bought this symbol today/);
  });

  it("allows manual SELL on strategy-owned position", () => {
    const r = canExecuteStrategyTrade("SELL", "HINDALCO", "NSE", {
      holdings: [
        { symbol: "HINDALCO", exchange: "NSE", qty: 10, avgPrice: 700, ltp: 710 },
      ],
      positions: [
        {
          id: "p1",
          symbol: "HINDALCO",
          exchange: "NSE",
          quantity: 10,
          entryPrice: 700,
          ltp: 710,
          state: "OPEN",
          ownerStrategyId: "macd-1",
          ownerStrategyName: "MACD Crossover",
          entryTime: new Date().toISOString(),
        },
      ],
      trades: [],
      settings,
      ownerStrategyId: OWNER_MANUAL,
      soldThisRun: new Set(),
    });
    assert.equal(r.allowed, true);
  });

  it("allows SELL when holding exists", () => {
    const r = canExecuteStrategyTrade("SELL", "TCS", "NSE", {
      holdings: [
        { symbol: "TCS", exchange: "NSE", qty: 1, avgPrice: 100, ltp: 105 },
      ],
      trades: [],
      settings,
      soldThisRun: new Set(),
    });
    assert.equal(r.allowed, true);
  });

  it("blocks strategy SELL when bought this scan", () => {
    const entryTime = new Date().toISOString();
    const r = canExecuteStrategyTrade("SELL", "TCS", "NSE", {
      holdings: [
        { symbol: "TCS", exchange: "NSE", qty: 1, avgPrice: 100, ltp: 105 },
      ],
      positions: [
        {
          id: "p1",
          symbol: "TCS",
          exchange: "NSE",
          quantity: 1,
          entryPrice: 100,
          ltp: 105,
          state: "OPEN",
          ownerStrategyId: "macd-1",
          ownerStrategyName: "MACD",
          entryTime,
        },
      ],
      trades: [],
      settings,
      soldThisRun: new Set(),
      boughtThisRun: new Set(["TCS:NSE"]),
      ownerStrategyId: "macd-1",
    });
    assert.equal(r.allowed, false);
    assert.match(r.reason ?? "", /Bought this scan/);
  });

  it("blocks strategy SELL within min hold from position entry", () => {
    const entryTime = new Date().toISOString();
    const r = canExecuteStrategyTrade("SELL", "TCS", "NSE", {
      holdings: [
        { symbol: "TCS", exchange: "NSE", qty: 1, avgPrice: 100, ltp: 105 },
      ],
      positions: [
        {
          id: "p1",
          symbol: "TCS",
          exchange: "NSE",
          quantity: 1,
          entryPrice: 100,
          ltp: 105,
          state: "OPEN",
          ownerStrategyId: "macd-1",
          ownerStrategyName: "MACD",
          entryTime,
        },
      ],
      trades: [],
      settings: { ...settings, minHoldMinutesBeforeSell: 60 },
      soldThisRun: new Set(),
      ownerStrategyId: "macd-1",
    });
    assert.equal(r.allowed, false);
    assert.match(r.reason ?? "", /Min hold/);
  });
});
