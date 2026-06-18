import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDailyPnlReport,
  shouldSendDailyPnlToday,
} from "./daily-pnl";
import type { PaperTrade } from "@/lib/firebase";

describe("daily-pnl", () => {
  it("builds report with today realized P&L from sells", () => {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    const trades: PaperTrade[] = [
      {
        id: "1",
        time: "",
        executedAt: new Date().toISOString(),
        date: today,
        symbol: "TCS",
        exchange: "NSE",
        side: "SELL",
        qty: 10,
        price: 4000,
        netPnl: 500,
      },
    ];
    const report = buildDailyPnlReport(trades, [], 900_000, 1_000_000);
    assert.equal(report.todayRealizedPnl, 500);
    assert.equal(report.sellsToday, 1);
    assert.equal(report.dateIST, today);
  });

  it("dedupes daily email by IST date", () => {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    assert.equal(shouldSendDailyPnlToday(today), false);
    assert.equal(shouldSendDailyPnlToday(undefined), true);
  });
});
