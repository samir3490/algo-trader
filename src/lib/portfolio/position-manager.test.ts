import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canStrategyExitPosition,
  canStrategyOpenPosition,
  closePositionInState,
  createOpenPosition,
  addPositionToState,
  ensurePositions,
} from "./position-manager";
import type { PaperTradingState } from "@/lib/firebase";
import { OWNER_MANUAL } from "./types";

function emptyState(): PaperTradingState {
  return { balance: 100_000, holdings: [], trades: [], positions: [] };
}

describe("position-manager", () => {
  it("opens position with owner", () => {
    const pos = createOpenPosition({
      symbol: "RELIANCE",
      exchange: "NSE",
      quantity: 10,
      entryPrice: 100,
      ltp: 100,
      ownerStrategyId: "strategy_a",
      ownerStrategyName: "Strategy A",
      signalReason: "MA crossover",
    });
    const state = addPositionToState(emptyState(), pos);
    assert.equal(state.positions?.length, 1);
    assert.equal(state.positions![0].ownerStrategyId, "strategy_a");
    assert.equal(state.positions![0].state, "OPEN");
  });

  it("blocks second strategy from opening same symbol", () => {
    const pos = createOpenPosition({
      symbol: "RELIANCE",
      exchange: "NSE",
      quantity: 10,
      entryPrice: 100,
      ltp: 100,
      ownerStrategyId: "strategy_a",
      ownerStrategyName: "A",
      signalReason: "buy",
    });
    const state = addPositionToState(emptyState(), pos);
    const check = canStrategyOpenPosition(state, "RELIANCE", "NSE", "strategy_b", false);
    assert.equal(check.allowed, false);
  });

  it("only owner can exit", () => {
    const pos = createOpenPosition({
      symbol: "RELIANCE",
      exchange: "NSE",
      quantity: 10,
      entryPrice: 100,
      ltp: 100,
      ownerStrategyId: "strategy_a",
      ownerStrategyName: "A",
      signalReason: "buy",
    });
    const state = addPositionToState(emptyState(), pos);
    assert.equal(
      canStrategyExitPosition(state, "RELIANCE", "NSE", "strategy_a").allowed,
      true
    );
    assert.equal(
      canStrategyExitPosition(state, "RELIANCE", "NSE", "strategy_b").allowed,
      false
    );
  });

  it("manual override can exit strategy-owned position", () => {
    const pos = createOpenPosition({
      symbol: "HINDALCO",
      exchange: "NSE",
      quantity: 10,
      entryPrice: 700,
      ltp: 710,
      ownerStrategyId: "macd-1",
      ownerStrategyName: "MACD Crossover",
      signalReason: "buy",
    });
    const state = addPositionToState(emptyState(), pos);
    const check = canStrategyExitPosition(
      state,
      "HINDALCO",
      "NSE",
      OWNER_MANUAL
    );
    assert.equal(check.allowed, true);
    assert.equal(check.position?.ownerStrategyName, "MACD Crossover");
  });

  it("closes with exit reason", () => {
    const pos = createOpenPosition({
      symbol: "RELIANCE",
      exchange: "NSE",
      quantity: 10,
      entryPrice: 100,
      ltp: 100,
      ownerStrategyId: "strategy_a",
      ownerStrategyName: "A",
      signalReason: "buy",
    });
    let state = addPositionToState(emptyState(), pos);
    const closed = closePositionInState(state, pos.id, 110, "TARGET_HIT", 10);
    state = closed.state;
    assert.equal(closed.closedQty, 10);
    assert.equal(state.positions![0].state, "CLOSED");
    assert.equal(state.positions![0].exitReason, "TARGET_HIT");
  });

  it("ensurePositions migrates legacy holdings", () => {
    const state = ensurePositions({
      balance: 50_000,
      holdings: [{ symbol: "TCS", exchange: "NSE", qty: 5, avgPrice: 3000, ltp: 3100 }],
      trades: [],
    });
    assert.ok((state.positions?.length ?? 0) >= 1);
  });
});
