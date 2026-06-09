import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluatePortfolioDecisions } from "./portfolio-manager";
import { addPositionToState, createOpenPosition } from "./position-manager";
import { DEFAULT_SETTINGS } from "@/lib/firebase";
import type { PaperTradingState } from "@/lib/firebase";

function emptyState(): PaperTradingState {
  return { balance: 100_000, holdings: [], trades: [], positions: [] };
}

const settings = { ...DEFAULT_SETTINGS, paperOrderNotional: 100_000 };

describe("portfolio-manager", () => {
  it("approves first BUY opinion", () => {
    const { decisions } = evaluatePortfolioDecisions(
      [
        {
          strategyId: "ma",
          strategyName: "MA Cross",
          symbol: "RELIANCE",
          exchange: "NSE",
          action: "BUY",
          price: 100,
          quantity: 10,
          reason: "golden cross",
          confidence: 0.8,
        },
      ],
      { state: emptyState(), settings }
    );
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].action, "BUY");
    assert.equal(decisions[0].ownerStrategyId, "ma");
  });

  it("skips duplicate BUY when position owned by another strategy", () => {
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

    const { decisions } = evaluatePortfolioDecisions(
      [
        {
          strategyId: "strategy_b",
          strategyName: "B",
          symbol: "RELIANCE",
          exchange: "NSE",
          action: "BUY",
          price: 95,
          quantity: 5,
          reason: "dip buy",
          confidence: 0.7,
        },
      ],
      { state, settings, multiStrategyMode: false }
    );
    assert.equal(decisions[0].action, "SKIP");
    assert.match(decisions[0].skipReason ?? "", /owned|duplicate/i);
  });

  it("rejects non-owner SELL", () => {
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

    const { decisions } = evaluatePortfolioDecisions(
      [
        {
          strategyId: "strategy_b",
          strategyName: "B",
          symbol: "RELIANCE",
          exchange: "NSE",
          action: "SELL",
          price: 90,
          quantity: 10,
          reason: "sell signal",
          confidence: 0.9,
        },
      ],
      { state, settings, multiStrategyMode: false }
    );
    assert.equal(decisions[0].action, "SKIP");
  });
});
