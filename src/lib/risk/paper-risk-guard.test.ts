import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  holdingPnlPercent,
  evaluateHoldingRiskExit,
  canPlacePaperBuy,
  applyPaperRiskExits,
  isPastMisSquareOff,
} from "./paper-risk-guard";
import { DEFAULT_SETTINGS } from "@/lib/firebase";

const baseSettings = { ...DEFAULT_SETTINGS };

describe("holdingPnlPercent", () => {
  it("computes gain and loss", () => {
    assert.equal(holdingPnlPercent(100, 105), 5);
    assert.equal(holdingPnlPercent(100, 98), -2);
  });
});

describe("evaluateHoldingRiskExit", () => {
  const holding = { symbol: "TCS", exchange: "NSE", qty: 1, avgPrice: 100, ltp: 97 };

  it("triggers stop loss at -2%", () => {
    const sig = evaluateHoldingRiskExit(holding, baseSettings);
    assert.equal(sig?.reason, "stop_loss");
  });

  it("triggers take profit at +5%", () => {
    const sig = evaluateHoldingRiskExit(
      { ...holding, ltp: 106 },
      baseSettings
    );
    assert.equal(sig?.reason, "take_profit");
  });

  it("does not trigger when auto flags off", () => {
    const sig = evaluateHoldingRiskExit(holding, {
      ...baseSettings,
      autoStopLoss: false,
      autoTakeProfit: false,
    });
    assert.equal(sig, null);
  });
});

describe("canPlacePaperBuy", () => {
  it("blocks when max positions reached", () => {
    const r = canPlacePaperBuy({
      balance: 1_000_000,
      orderValue: 1000,
      holdingsCount: baseSettings.maxPositions,
      settings: baseSettings,
    });
    assert.equal(r.allowed, false);
  });

  it("blocks when order too large", () => {
    const r = canPlacePaperBuy({
      balance: 1_000_000,
      orderValue: baseSettings.maxOrderValue + 1,
      holdingsCount: 0,
      settings: baseSettings,
    });
    assert.equal(r.allowed, false);
  });
});

describe("applyPaperRiskExits", () => {
  it("sells holding on stop loss", () => {
    const { state, exits } = applyPaperRiskExits(
      {
        balance: 500_000,
        holdings: [
          { symbol: "HAL", exchange: "NSE", qty: 10, avgPrice: 100, ltp: 97 },
        ],
        trades: [],
      },
      baseSettings
    );
    assert.equal(exits.length, 1);
    assert.equal(state.holdings?.length, 0);
    assert.equal(state.trades?.length, 1);
    assert.equal(state.trades?.[0].side, "SELL");
    assert.equal(state.trades?.[0].strategyName, "Risk guard");
  });
});

describe("isPastMisSquareOff", () => {
  it("returns true after square-off time", () => {
    const late = new Date("2026-05-27T16:00:00+05:30");
    assert.equal(isPastMisSquareOff("15:15", late), true);
  });
});
