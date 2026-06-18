import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluatePortfolioDecisions,
  buildRankedPaperSellQueue,
} from "./portfolio-manager";
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

  it("consolidates duplicate BUY opinions to highest confidence", () => {
    const { decisions } = evaluatePortfolioDecisions(
      [
        {
          strategyId: "strategy_a",
          strategyName: "A",
          symbol: "RELIANCE",
          exchange: "NSE",
          action: "BUY",
          price: 100,
          quantity: 10,
          reason: "weak buy",
          confidence: 0.5,
        },
        {
          strategyId: "strategy_b",
          strategyName: "B",
          symbol: "RELIANCE",
          exchange: "NSE",
          action: "BUY",
          price: 100,
          quantity: 10,
          reason: "strong buy",
          confidence: 0.9,
        },
      ],
      { state: emptyState(), settings }
    );
    const buys = decisions.filter((d) => d.action === "BUY");
    assert.equal(buys.length, 1);
    assert.equal(buys[0].ownerStrategyId, "strategy_b");
    assert.equal(buys[0].buySignalCount, 2);
    assert.ok((buys[0].confidenceSum ?? 0) >= 1.4);
    assert.deepEqual(buys[0].signalStrategyNames, ["A", "B"]);
  });

  it("approves all unique BUY symbols — position cap enforced at scan execution", () => {
    const opinions = Array.from({ length: 8 }, (_, i) => ({
      strategyId: `strategy_${i}`,
      strategyName: `S${i}`,
      symbol: `STOCK${i}`,
      exchange: "NSE",
      action: "BUY" as const,
      price: 100,
      quantity: 10,
      reason: "buy",
      confidence: 0.5,
    }));
    const { decisions } = evaluatePortfolioDecisions(opinions, {
      state: { ...emptyState(), balance: 10_000_000 },
      settings: { ...settings, maxPositions: 5 },
    });
    const buys = decisions.filter((d) => d.action === "BUY");
    assert.equal(buys.length, 8);
  });

  it("ignores SELL opinions — paper exits use stop-loss / take-profit", () => {
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
    assert.equal(decisions.length, 0);
  });

  it("buildRankedPaperSellQueue skips symbols with active BUY signals", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const pos = createOpenPosition({
      symbol: "RELIANCE",
      exchange: "NSE",
      quantity: 10,
      entryPrice: 100,
      ltp: 106,
      ownerStrategyId: "strategy_a",
      ownerStrategyName: "A",
      signalReason: "buy",
    });
    pos.entryTime = twoHoursAgo;
    const state = addPositionToState(emptyState(), pos);

    const queue = buildRankedPaperSellQueue(
      [
        {
          strategyId: "strategy_a",
          strategyName: "A",
          symbol: "RELIANCE",
          exchange: "NSE",
          action: "SELL",
          price: 90,
          quantity: 10,
          reason: "sell",
          confidence: 0.9,
        },
        {
          strategyId: "strategy_b",
          strategyName: "B",
          symbol: "RELIANCE",
          exchange: "NSE",
          action: "BUY",
          price: 100,
          quantity: 10,
          reason: "buy again",
          confidence: 0.5,
        },
      ],
      { state, settings }
    );
    assert.equal(queue.length, 0);
  });

  it("buildRankedPaperSellQueue approves SELL after min hold at take-profit", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const pos = createOpenPosition({
      symbol: "RELIANCE",
      exchange: "NSE",
      quantity: 10,
      entryPrice: 100,
      ltp: 106,
      ownerStrategyId: "strategy_a",
      ownerStrategyName: "A",
      signalReason: "buy",
    });
    pos.entryTime = twoHoursAgo;
    const state = addPositionToState(emptyState(), pos);

    const queue = buildRankedPaperSellQueue(
      [
        {
          strategyId: "strategy_a",
          strategyName: "A",
          symbol: "RELIANCE",
          exchange: "NSE",
          action: "SELL",
          price: 106,
          quantity: 10,
          reason: "sell",
          confidence: 0.9,
        },
        {
          strategyId: "strategy_b",
          strategyName: "B",
          symbol: "RELIANCE",
          exchange: "NSE",
          action: "SELL",
          price: 106,
          quantity: 10,
          reason: "sell confirm",
          confidence: 0.8,
        },
      ],
      { state, settings }
    );
    assert.equal(queue.length, 1);
    assert.equal(queue[0].action, "SELL");
  });

  it("buildRankedPaperSellQueue blocks sell below take-profit target", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const pos = createOpenPosition({
      symbol: "RELIANCE",
      exchange: "NSE",
      quantity: 10,
      entryPrice: 100,
      ltp: 103,
      ownerStrategyId: "strategy_a",
      ownerStrategyName: "A",
      signalReason: "buy",
    });
    pos.entryTime = twoHoursAgo;
    const state = addPositionToState(emptyState(), pos);

    const queue = buildRankedPaperSellQueue(
      [
        {
          strategyId: "strategy_a",
          strategyName: "A",
          symbol: "RELIANCE",
          exchange: "NSE",
          action: "SELL",
          price: 103,
          quantity: 10,
          reason: "sell",
          confidence: 0.9,
        },
      ],
      { state, settings: { ...settings, takeProfitPercent: 5 } }
    );
    assert.equal(queue.length, 0);
  });

  it("buildRankedPaperSellQueue consolidates sell weight across strategies", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const pos = createOpenPosition({
      symbol: "RELIANCE",
      exchange: "NSE",
      quantity: 10,
      entryPrice: 100,
      ltp: 108,
      ownerStrategyId: "strategy_a",
      ownerStrategyName: "A",
      signalReason: "buy",
    });
    pos.entryTime = twoHoursAgo;
    const state = addPositionToState(emptyState(), pos);

    const queue = buildRankedPaperSellQueue(
      [
        {
          strategyId: "strategy_a",
          strategyName: "A",
          symbol: "RELIANCE",
          exchange: "NSE",
          action: "SELL",
          price: 108,
          quantity: 10,
          reason: "macd cross",
          confidence: 0.7,
        },
        {
          strategyId: "strategy_b",
          strategyName: "B",
          symbol: "RELIANCE",
          exchange: "NSE",
          action: "SELL",
          price: 108,
          quantity: 10,
          reason: "rsi overbought",
          confidence: 0.9,
        },
      ],
      { state, settings }
    );
    assert.equal(queue.length, 1);
    assert.equal(queue[0].sellSignalCount, 2);
    assert.deepEqual(queue[0].signalStrategyNames, ["A", "B"]);
    assert.equal(queue[0].ownerStrategyId, "strategy_a");
  });

  it("buildRankedPaperSellQueue blocks single weak sell signal", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const pos = createOpenPosition({
      symbol: "RELIANCE",
      exchange: "NSE",
      quantity: 10,
      entryPrice: 100,
      ltp: 108,
      ownerStrategyId: "strategy_a",
      ownerStrategyName: "A",
      signalReason: "buy",
    });
    pos.entryTime = twoHoursAgo;
    const state = addPositionToState(emptyState(), pos);

    const queue = buildRankedPaperSellQueue(
      [
        {
          strategyId: "strategy_b",
          strategyName: "B",
          symbol: "RELIANCE",
          exchange: "NSE",
          action: "SELL",
          price: 108,
          quantity: 10,
          reason: "weak sell",
          confidence: 0.4,
        },
      ],
      { state, settings: { ...settings, strategySellMinSignals: 2 } }
    );
    assert.equal(queue.length, 0);
  });

  it("buildRankedPaperSellQueue blocks sell within min hold", () => {
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

    const queue = buildRankedPaperSellQueue(
      [
        {
          strategyId: "strategy_a",
          strategyName: "A",
          symbol: "RELIANCE",
          exchange: "NSE",
          action: "SELL",
          price: 90,
          quantity: 10,
          reason: "sell",
          confidence: 0.9,
        },
      ],
      { state, settings: { ...settings, minHoldMinutesBeforeSell: 60 } }
    );
    assert.equal(queue.length, 0);
  });
});
