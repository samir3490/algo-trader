import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canStrategyExitPosition,
  canStrategyOpenPosition,
  closePositionInState,
  createOpenPosition,
  addPositionToState,
  addToOpenPosition,
  ensurePositions,
  hasOpenPositionForSymbol,
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

  it("ensurePositions adopts orphan holding when other positions exist", () => {
    const state = ensurePositions({
      balance: 50_000,
      positions: [
        {
          id: "p-other",
          symbol: "TCS",
          exchange: "NSE",
          quantity: 2,
          entryPrice: 3000,
          ltp: 3100,
          ownerStrategyId: "s1",
          state: "OPEN",
          entryTime: "2026-08-07T04:00:00.000Z",
        },
      ],
      holdings: [
        { symbol: "TCS", exchange: "NSE", qty: 2, avgPrice: 3000, ltp: 3100 },
        { symbol: "HDFCLIFE", exchange: "NSE", qty: 14, avgPrice: 780, ltp: 790 },
      ],
      trades: [],
    });
    assert.equal(
      hasOpenPositionForSymbol(state, "HDFCLIFE", "NSE"),
      true
    );
    const hdfc = state.holdings?.find((h) => h.symbol === "HDFCLIFE");
    assert.equal(hdfc?.qty, 14);
  });

  it("treats holdings qty as an open position for add-on gate", () => {
    const state: PaperTradingState = {
      balance: 50_000,
      positions: [],
      holdings: [
        { symbol: "HDFCLIFE", exchange: "NSE", qty: 14, avgPrice: 780, ltp: 790 },
      ],
      trades: [],
    };
    assert.equal(hasOpenPositionForSymbol(state, "HDFCLIFE", "NSE"), true);
    assert.equal(hasOpenPositionForSymbol(state, "TCS", "NSE"), false);
  });

  it("addToOpenPosition merges qty and average", () => {
    const pos = createOpenPosition({
      symbol: "HDFCLIFE",
      exchange: "NSE",
      quantity: 10,
      entryPrice: 700,
      ltp: 700,
      ownerStrategyId: "s1",
      ownerStrategyName: "A",
    });
    let state = addPositionToState(emptyState(), pos);
    state = addToOpenPosition(state, pos.id, 5, 800, 800);
    assert.equal(state.positions?.[0]?.quantity, 15);
    assert.equal(state.positions?.[0]?.entryPrice, 733.33);
    assert.equal(state.holdings?.[0]?.qty, 15);
  });

  it("collapses duplicate open lots for the same symbol", () => {
    const a = createOpenPosition({
      symbol: "HDFCLIFE",
      exchange: "NSE",
      quantity: 10,
      entryPrice: 700,
      ltp: 700,
      ownerStrategyId: "s1",
    });
    const b = createOpenPosition({
      symbol: "HDFCLIFE",
      exchange: "NSE",
      quantity: 6,
      entryPrice: 800,
      ltp: 800,
      ownerStrategyId: "s2",
    });
    const state = addPositionToState(addPositionToState(emptyState(), a), b);
    const open = (state.positions ?? []).filter(
      (p) => p.state === "OPEN" || p.state === "PARTIAL_EXIT"
    );
    assert.equal(open.length, 1);
    assert.equal(open[0].quantity, 16);
    assert.equal(state.holdings?.[0]?.qty, 16);
  });
});
