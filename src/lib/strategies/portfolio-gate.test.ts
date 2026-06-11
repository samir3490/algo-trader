import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canExecuteStrategyTrade } from "./portfolio-gate";
import { DEFAULT_SETTINGS } from "@/lib/firebase";
import type { PaperTrade } from "@/lib/firebase";

const settings = { ...DEFAULT_SETTINGS, rebuyCooldownMinutes: 240 };

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

  it("allows BUY when soldThisRun during paper strategy scan", () => {
    const sold = new Set(["SAIL:NSE"]);
    const r = canExecuteStrategyTrade("BUY", "SAIL", "NSE", {
      holdings: [],
      trades: [],
      settings,
      soldThisRun: sold,
      paperStrategyScan: true,
    });
    assert.equal(r.allowed, true);
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
        date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
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
      symbolsLockedToday: { "POLICYBAZAAR:NSE": new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) },
    });
    assert.equal(r.allowed, false);
    assert.match(r.reason ?? "", /locked/);
  });

  it("allows BUY after same-day sell when paperStrategyScan", () => {
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
        date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
        executedAt: new Date().toISOString(),
      },
    ];
    const r = canExecuteStrategyTrade("BUY", "SAIL", "NSE", {
      holdings: [],
      trades,
      settings,
      soldThisRun: new Set(),
      paperStrategyScan: true,
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
});
