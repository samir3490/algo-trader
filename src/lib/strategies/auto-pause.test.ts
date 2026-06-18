import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateAutoPause } from "./auto-pause";
import { DEFAULT_SETTINGS } from "@/lib/firebase";
import type { ActiveStrategy, PaperTrade } from "@/lib/firebase";

const strat: ActiveStrategy = {
  id: "s1",
  name: "MACD",
  symbol: "RELIANCE",
  exchange: "NSE",
  timeframe: "Day",
  mode: "paper",
  params: {},
  status: "running",
  createdAt: new Date().toISOString(),
  signals: 0,
  pnl: 0,
};

describe("evaluateAutoPause", () => {
  it("returns empty when disabled", () => {
    assert.equal(
      evaluateAutoPause([strat], [], {
        ...DEFAULT_SETTINGS,
        autoPauseEnabled: false,
      }).length,
      0
    );
  });

  it("pauses when rolling loss exceeds limit", () => {
    const trades: PaperTrade[] = [
      {
        id: "1",
        time: "x",
        symbol: "RELIANCE",
        exchange: "NSE",
        side: "SELL",
        qty: 10,
        price: 90,
        netPnl: -6000,
        date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
        executedAt: new Date().toISOString(),
        ownerStrategyId: "s1",
      },
    ];
    const hits = evaluateAutoPause([strat], trades, {
      ...DEFAULT_SETTINGS,
      autoPauseEnabled: true,
      autoPauseLookbackDays: 14,
      autoPauseMaxLoss: 5000,
    });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].strategyId, "s1");
  });
});
