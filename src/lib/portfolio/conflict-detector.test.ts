import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectStrategyConflicts,
  opinionsBlockedByConflict,
} from "./conflict-detector";
import type { StrategyOpinion } from "./types";

describe("conflict-detector", () => {
  it("detects BUY vs SELL on same symbol", () => {
    const opinions: StrategyOpinion[] = [
      {
        strategyId: "a",
        strategyName: "A",
        symbol: "RELIANCE",
        exchange: "NSE",
        action: "BUY",
        price: 100,
        quantity: 10,
        reason: "buy",
        confidence: 1,
      },
      {
        strategyId: "b",
        strategyName: "B",
        symbol: "RELIANCE",
        exchange: "NSE",
        action: "SELL",
        price: 90,
        quantity: 10,
        reason: "sell",
        confidence: 1,
      },
    ];
    const conflicts = detectStrategyConflicts(opinions);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].type, "CONFLICTING_STRATEGY_SIGNAL");
    assert.equal(conflicts[0].symbol, "RELIANCE");
  });

  it("ignores same-side opinions", () => {
    const opinions: StrategyOpinion[] = [
      {
        strategyId: "a",
        strategyName: "A",
        symbol: "TCS",
        exchange: "NSE",
        action: "BUY",
        price: 3000,
        quantity: 5,
        reason: "buy",
        confidence: 1,
      },
      {
        strategyId: "b",
        strategyName: "B",
        symbol: "TCS",
        exchange: "NSE",
        action: "BUY",
        price: 2990,
        quantity: 5,
        reason: "buy",
        confidence: 1,
      },
    ];
    assert.equal(detectStrategyConflicts(opinions).length, 0);
  });

  it("allows BUY when flat despite opposing SELL conflict", () => {
    const opinions: StrategyOpinion[] = [
      {
        strategyId: "a",
        strategyName: "A",
        symbol: "RELIANCE",
        exchange: "NSE",
        action: "BUY",
        price: 100,
        quantity: 10,
        reason: "buy",
        confidence: 1,
      },
      {
        strategyId: "b",
        strategyName: "B",
        symbol: "RELIANCE",
        exchange: "NSE",
        action: "SELL",
        price: 90,
        quantity: 10,
        reason: "sell",
        confidence: 1,
      },
    ];
    const conflicts = detectStrategyConflicts(opinions);
    const blocked = opinionsBlockedByConflict(opinions, conflicts, () => false);
    assert.equal(blocked.has("a:RELIANCE:NSE:BUY"), false);
    assert.equal(blocked.has("b:RELIANCE:NSE:SELL"), true);
  });

  it("allows SELL when holding despite opposing BUY conflict", () => {
    const opinions: StrategyOpinion[] = [
      {
        strategyId: "a",
        strategyName: "A",
        symbol: "RELIANCE",
        exchange: "NSE",
        action: "BUY",
        price: 100,
        quantity: 10,
        reason: "buy",
        confidence: 1,
      },
      {
        strategyId: "b",
        strategyName: "B",
        symbol: "RELIANCE",
        exchange: "NSE",
        action: "SELL",
        price: 90,
        quantity: 10,
        reason: "sell",
        confidence: 1,
      },
    ];
    const conflicts = detectStrategyConflicts(opinions);
    const blocked = opinionsBlockedByConflict(opinions, conflicts, () => true);
    assert.equal(blocked.has("a:RELIANCE:NSE:BUY"), true);
    assert.equal(blocked.has("b:RELIANCE:NSE:SELL"), false);
  });
});
