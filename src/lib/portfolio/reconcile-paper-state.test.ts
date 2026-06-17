import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PaperTradingState } from "@/lib/firebase";
import {
  detectPaperStateIssues,
  reconcilePaperState,
} from "./reconcile-paper-state";

const basePosition = {
  id: "p1",
  symbol: "RELIANCE",
  exchange: "NSE",
  quantity: 10,
  entryPrice: 2500,
  ltp: 2550,
  ownerStrategyId: "macd-1",
  ownerStrategyName: "MACD Crossover",
  state: "OPEN" as const,
  entryTime: "2026-05-27T10:00:00.000Z",
};

describe("reconcilePaperState", () => {
  it("reports orphan holding when holdings diverge from positions", () => {
    const state: PaperTradingState = {
      balance: 900_000,
      positions: [basePosition],
      holdings: [
        {
          symbol: "RELIANCE",
          exchange: "NSE",
          qty: 5,
          avgPrice: 2500,
          ltp: 2550,
        },
      ],
      trades: [],
    };

    const issues = detectPaperStateIssues(state);
    assert.ok(issues.some((i) => i.code === "holdings_qty_mismatch"));

    const result = reconcilePaperState(state);
    assert.ok(result.changes.length > 0);
    assert.equal(result.state.holdings?.[0]?.qty, 10);
  });

  it("dedupes duplicate trades", () => {
    const state: PaperTradingState = {
      balance: 1_000_000,
      positions: [],
      holdings: [],
      trades: [
        {
          id: "t1",
          symbol: "TCS",
          exchange: "NSE",
          side: "BUY",
          qty: 1,
          price: 4000,
          date: "2026-05-27",
          strategyName: "RSI",
        },
        {
          id: "t2",
          symbol: "TCS",
          exchange: "NSE",
          side: "BUY",
          qty: 1,
          price: 4000,
          date: "2026-05-27",
          strategyName: "RSI",
        },
      ],
    };

    const result = reconcilePaperState(state);
    assert.equal(result.state.trades?.length, 1);
    assert.ok(result.changes.some((c) => c.includes("Deduped")));
  });

  it("prunes zero-qty open positions", () => {
    const state: PaperTradingState = {
      balance: 1_000_000,
      positions: [{ ...basePosition, quantity: 0 }],
      holdings: [],
      trades: [],
    };

    const result = reconcilePaperState(state);
    assert.equal(result.state.positions?.length, 0);
  });
});
