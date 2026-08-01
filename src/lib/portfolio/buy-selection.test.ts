import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  compareBuyRank,
  rankBuyDecisionsByStrength,
  remainingPositionSlots,
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

  it("breaks ties alphabetically by symbol", () => {
    const ranked = rankBuyDecisionsByStrength([
      buy("ZZZ", 3),
      buy("AAA", 3),
      buy("MMM", 3),
    ]);
    assert.deepEqual(
      ranked.map((d) => d.symbol),
      ["AAA", "MMM", "ZZZ"]
    );
    assert.equal(compareBuyRank(buy("B", 2), buy("A", 2)), 1);
  });

  it("selects up to maxPositions when flat", () => {
    const decisions = Array.from({ length: 8 }, (_, i) =>
      buy(`S${i}`, 8 - i)
    );
    const { toExecute, deferred, slotsToFill } = selectTopBuyDecisionsForScan(
      decisions,
      {
        openPositionCount: 0,
        maxPositions: 5,
      }
    );
    assert.equal(slotsToFill, 5);
    assert.equal(toExecute.length, 5);
    assert.equal(deferred.length, 3);
    assert.equal(toExecute[0].symbol, "S0");
  });

  it("respects open positions vs maxPositions", () => {
    assert.equal(remainingPositionSlots(3, 5), 2);
    const { slotsToFill, toExecute } = selectTopBuyDecisionsForScan(
      [buy("A", 1), buy("B", 1)],
      { openPositionCount: 4, maxPositions: 5 }
    );
    assert.equal(slotsToFill, 1);
    assert.equal(toExecute.length, 1);
  });

  it("prefers strong / higher sector performance over signal count", () => {
    const weakHighSignals: PortfolioDecision = {
      ...buy("TATASTEEL", 5),
      sectorIsStrong: false,
      sectorChangePercent: -1.2,
      sectorName: "Metal",
    };
    const strongLowSignals: PortfolioDecision = {
      ...buy("TCS", 2),
      sectorIsStrong: true,
      sectorChangePercent: 1.5,
      sectorName: "IT",
    };
    const ranked = rankBuyDecisionsByStrength([
      weakHighSignals,
      strongLowSignals,
    ]);
    assert.equal(ranked[0].symbol, "TCS");
    assert.equal(ranked[1].symbol, "TATASTEEL");
  });
});
