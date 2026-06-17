import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeStrategyDetailBundles,
  computeStrategyPerformance,
  enrichTradesWithStrategy,
  buildStrategyNamesBySymbol,
} from "./strategy-performance";
import type { PaperTrade } from "@/lib/firebase";

function trade(
  partial: Partial<PaperTrade> & Pick<PaperTrade, "id" | "side" | "symbol" | "qty" | "price">
): PaperTrade {
  return {
    time: "1 Jan 2026, 10:00:00",
    exchange: "NSE",
    executedAt: "2026-01-01T04:30:00.000Z",
    ...partial,
  };
}

describe("computeStrategyPerformance", () => {
  it("combines trades from multiple active instances of the same strategy", () => {
    const trades: PaperTrade[] = [
      trade({
        id: "1",
        side: "BUY",
        symbol: "RELIANCE",
        qty: 10,
        price: 100,
        strategyId: "active-1-RELIANCE",
        ownerStrategyId: "active-1-RELIANCE",
        strategyName: "MA Crossover",
      }),
      trade({
        id: "2",
        side: "SELL",
        symbol: "RELIANCE",
        qty: 10,
        price: 110,
        strategyId: "active-1-RELIANCE",
        ownerStrategyId: "active-1-RELIANCE",
        strategyName: "MA Crossover",
      }),
      trade({
        id: "3",
        side: "BUY",
        symbol: "TCS",
        qty: 5,
        price: 3000,
        strategyId: "active-2-TCS",
        ownerStrategyId: "active-2-TCS",
        strategyName: "MA Crossover",
      }),
      trade({
        id: "4",
        side: "SELL",
        symbol: "TCS",
        qty: 5,
        price: 3100,
        strategyId: "active-2-TCS",
        ownerStrategyId: "active-2-TCS",
        strategyName: "MA Crossover",
      }),
    ];

    const rows = computeStrategyPerformance(trades);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].strategyName, "MA Crossover");
    assert.equal(rows[0].trades, 4);
    assert.equal(rows[0].closedRounds, 2);
    assert.equal(rows[0].realizedPnl, 100 + 500);
  });
});

describe("computeStrategyDetailBundles", () => {
  it("returns one bundle per strategy name", () => {
    const trades: PaperTrade[] = [
      trade({
        id: "1",
        side: "BUY",
        symbol: "RELIANCE",
        qty: 1,
        price: 100,
        strategyId: "active-1-RELIANCE",
        strategyName: "RSI Reversal",
      }),
      trade({
        id: "2",
        side: "BUY",
        symbol: "INFY",
        qty: 1,
        price: 1500,
        strategyId: "active-2-INFY",
        strategyName: "RSI Reversal",
      }),
    ];

    const bundles = computeStrategyDetailBundles(trades);
    assert.equal(bundles.length, 1);
    assert.equal(bundles[0].symbols.length, 2);
  });
});

describe("enrichTradesWithStrategy", () => {
  it("shows separate strategy names for multi-signal buys", () => {
    const trades: PaperTrade[] = [
      trade({
        id: "1",
        side: "BUY",
        symbol: "RELIANCE",
        qty: 10,
        price: 100,
        strategyName: "MA Crossover",
        buySignalCount: 2,
        signalStrategyNames: ["MA Crossover", "RSI Reversal"],
      }),
    ];
    const enriched = enrichTradesWithStrategy(trades);
    assert.deepEqual(enriched[0].displayStrategyNames, [
      "MA Crossover",
      "RSI Reversal",
    ]);
    assert.equal(enriched[0].unknownStrategyCount, 0);
  });

  it("infers names from active strategies on symbol when not stored", () => {
    const trades: PaperTrade[] = [
      trade({
        id: "1",
        side: "BUY",
        symbol: "TCS",
        qty: 5,
        price: 3000,
        strategyName: "MA Crossover",
        buySignalCount: 2,
      }),
    ];
    const bySymbol = buildStrategyNamesBySymbol([
      { symbol: "TCS", exchange: "NSE", name: "MA Crossover" },
      { symbol: "TCS", exchange: "NSE", name: "RSI Reversal" },
    ]);
    const enriched = enrichTradesWithStrategy(trades, {
      strategyNamesBySymbol: bySymbol,
    });
    assert.deepEqual(enriched[0].displayStrategyNames, [
      "MA Crossover",
      "RSI Reversal",
    ]);
  });
});
