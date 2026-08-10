import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { executePortfolioDecision } from "./order-engine";
import { addPositionToState, createOpenPosition } from "./position-manager";
import type { PaperTradingState } from "@/lib/firebase";

function emptyState(): PaperTradingState {
  return { balance: 1_000_000, holdings: [], trades: [], positions: [] };
}

describe("executePortfolioDecision BUY", () => {
  it("merges add-on buy into the existing open lot instead of leaving qty stale", () => {
    const pos = createOpenPosition({
      symbol: "HDFCLIFE",
      exchange: "NSE",
      quantity: 10,
      entryPrice: 700,
      ltp: 700,
      ownerStrategyId: "macd-1",
      ownerStrategyName: "MACD",
    });
    const state = addPositionToState(emptyState(), pos);

    const result = executePortfolioDecision(state, {
      action: "BUY",
      symbol: "HDFCLIFE",
      exchange: "NSE",
      ownerStrategyId: "rsi-1",
      ownerStrategyName: "RSI",
      price: 760,
      quantity: 11,
      signalReason: "RSI oversold",
    });

    assert.equal(result.executed, true);
    const open = (result.state.positions ?? []).filter(
      (p) => p.state === "OPEN" || p.state === "PARTIAL_EXIT"
    );
    assert.equal(open.length, 1);
    assert.equal(open[0].quantity, 21);
    assert.equal(result.state.holdings?.[0]?.qty, 21);
    assert.equal(result.trade?.qty, 11);
  });
});
