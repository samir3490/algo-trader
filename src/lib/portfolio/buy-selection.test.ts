import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  rankBuyDecisionsByStrength,
  selectTopBuyDecisionsForScan,
} from "./buy-selection";
import type { PortfolioDecision } from "./types";

function buy(
  symbol: string,
  count: number,
  price = 100
): PortfolioDecision {
  return {
    action: "BUY",
    symbol,
    exchange: "NSE",
    ownerStrategyId: `s-${symbol}`,
    ownerStrategyName: symbol,
    price,
    quantity: 10,
    signalReason: "test",
    buySignalCount: count,
  };
}

describe("buy-selection", () => {
  it("ranks by buySignalCount descending", () => {
    const ranked = rankBuyDecisionsByStrength([
      buy("AAA", 1),
      buy("BBB", 5),
      buy("CCC", 3),
    ]);
    assert.deepEqual(
      ranked.map((d) => d.symbol),
      ["BBB", "CCC", "AAA"]
    );
  });

  it("selects top 5 when flat", () => {
    const decisions = Array.from({ length: 8 }, (_, i) =>
      buy(`S${i}`, 8 - i)
    );
    const { toExecute, deferred } = selectTopBuyDecisionsForScan(decisions, {
      openPositionCount: 0,
      maxPositions: 10,
    });
    assert.equal(toExecute.length, 5);
    assert.equal(deferred.length, 3);
    assert.equal(toExecute[0].symbol, "S0");
  });
});
