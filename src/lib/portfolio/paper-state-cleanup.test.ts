import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ensurePaperTradingBalance,
  prunePaperStateForScan,
} from "./paper-state-cleanup";

describe("prunePaperStateForScan", () => {
  it("removes closed positions from slot count", () => {
    const state = prunePaperStateForScan({
      balance: 1_000_000,
      holdings: [],
      trades: [],
      positions: [
        {
          id: "open",
          symbol: "TCS",
          exchange: "NSE",
          quantity: 10,
          entryPrice: 100,
          ltp: 100,
          ownerStrategyId: "s1",
          state: "OPEN",
          entryTime: new Date().toISOString(),
        },
        {
          id: "closed",
          symbol: "INFY",
          exchange: "NSE",
          quantity: 0,
          entryPrice: 100,
          ltp: 100,
          ownerStrategyId: "s1",
          state: "CLOSED",
          entryTime: new Date().toISOString(),
        },
      ],
    });
    assert.equal(state.positions?.length, 1);
    assert.equal(state.positions?.[0]?.symbol, "TCS");
  });
});

describe("ensurePaperTradingBalance", () => {
  it("restores starting balance when flat and balance is zero", () => {
    const out = ensurePaperTradingBalance(
      { balance: 0, holdings: [], trades: [], positions: [] },
      { paperStartingBalance: 10_000_000 }
    );
    assert.equal(out.balance, 10_000_000);
  });
});
