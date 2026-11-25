import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  holdingPnlPercent,
  evaluateHoldingRiskExit,
  evaluatePositionRiskExit,
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

  it("does not hard-exit holdings at +5% (trailing owns winners)", () => {
    const sig = evaluateHoldingRiskExit(
      { ...holding, ltp: 106 },
      { ...baseSettings, autoTakeProfit: true, autoStopLoss: false }
    );
    assert.equal(sig, null);
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

describe("evaluatePositionRiskExit", () => {
  it("triggers stop loss before trailing stop when both could apply", () => {
    const sig = evaluatePositionRiskExit(
      {
        id: "p1",
        symbol: "TCS",
        exchange: "NSE",
        quantity: 10,
        entryPrice: 100,
        ltp: 98,
        peakPrice: 110,
        state: "OPEN",
        ownerStrategyId: "s1",
        entryTime: new Date().toISOString(),
      },
      { ...baseSettings, autoTrailingStop: true, trailingStopPercent: 5 }
    );
    assert.equal(sig?.reason, "stop_loss");
  });

  it("does not trigger trailing stop until arm threshold (~stop distance)", () => {
    const sig = evaluatePositionRiskExit(
      {
        id: "p1",
        symbol: "TCS",
        exchange: "NSE",
        quantity: 10,
        entryPrice: 100,
        ltp: 101,
        peakPrice: 101.5,
        state: "OPEN",
        ownerStrategyId: "s1",
        entryTime: new Date().toISOString(),
      },
      {
        ...baseSettings,
        autoTrailingStop: true,
        trailingStopPercent: 2,
        takeProfitPercent: 5,
        stopLossPercent: 2,
        autoTakeProfit: false,
      }
    );
    assert.equal(sig, null);
  });

  it("triggers stage-1 trailing after ~+2% peak (no hard +5%)", () => {
    const sig = evaluatePositionRiskExit(
      {
        id: "p1",
        symbol: "TCS",
        exchange: "NSE",
        quantity: 10,
        entryPrice: 100,
        ltp: 100.9,
        peakPrice: 103,
        state: "OPEN",
        ownerStrategyId: "s1",
        entryTime: new Date().toISOString(),
      },
      {
        ...baseSettings,
        autoTrailingStop: true,
        trailingStopPercent: 2,
        trailingStopAfterTargetPercent: 2,
        takeProfitPercent: 5,
        stopLossPercent: 2,
        autoTakeProfit: true,
      }
    );
    assert.equal(sig?.reason, "trailing_stop");
    assert.match(sig?.message ?? "", /stage-1/);
  });

  it("does not hard-exit at +5% — keeps position when above trail floor", () => {
    const sig = evaluatePositionRiskExit(
      {
        id: "p1",
        symbol: "TCS",
        exchange: "NSE",
        quantity: 10,
        entryPrice: 100,
        ltp: 105.5,
        peakPrice: 106,
        state: "OPEN",
        ownerStrategyId: "s1",
        entryTime: new Date().toISOString(),
      },
      {
        ...baseSettings,
        autoTrailingStop: true,
        trailingStopPercent: 2,
        trailingStopAfterTargetPercent: 2,
        takeProfitPercent: 5,
        stopLossPercent: 2,
        autoTakeProfit: true,
        autoStopLoss: true,
      }
    );
    assert.equal(sig, null);
  });

  it("triggers stage-2 trailing after +5% peak pullback", () => {
    const sig = evaluatePositionRiskExit(
      {
        id: "p1",
        symbol: "TCS",
        exchange: "NSE",
        quantity: 10,
        entryPrice: 100,
        ltp: 106.8,
        peakPrice: 110,
        state: "OPEN",
        ownerStrategyId: "s1",
        entryTime: new Date().toISOString(),
      },
      {
        ...baseSettings,
        autoTrailingStop: true,
        trailingStopPercent: 2,
        trailingStopAfterTargetPercent: 2,
        takeProfitPercent: 5,
        stopLossPercent: 2,
        autoTakeProfit: true,
      }
    );
    // Peak +10%, trail 2% → floor 107.8; ltp 106.8 ≤ floor → stage-2 trail
    assert.equal(sig?.reason, "trailing_stop");
    assert.match(sig?.message ?? "", /stage-2/);
  });

  it("triggers trailing stop from peak after min profit armed", () => {
    const sig = evaluatePositionRiskExit(
      {
        id: "p1",
        symbol: "TCS",
        exchange: "NSE",
        quantity: 10,
        entryPrice: 100,
        ltp: 104,
        peakPrice: 110,
        state: "OPEN",
        ownerStrategyId: "s1",
        entryTime: new Date().toISOString(),
      },
      { ...baseSettings, autoTrailingStop: true, trailingStopPercent: 5, autoTakeProfit: false }
    );
    assert.equal(sig?.reason, "trailing_stop");
  });

  it("triggers max hold days", () => {
    const old = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const sig = evaluatePositionRiskExit(
      {
        id: "p1",
        symbol: "TCS",
        exchange: "NSE",
        quantity: 10,
        entryPrice: 100,
        ltp: 101,
        state: "OPEN",
        ownerStrategyId: "s1",
        entryTime: old,
      },
      { ...baseSettings, maxHoldDays: 7, autoStopLoss: false, autoTakeProfit: false }
    );
    assert.equal(sig?.reason, "max_hold_days");
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
      orderValue: baseSettings.paperMaxOrderValue + 1,
      holdingsCount: 0,
      settings: baseSettings,
    });
    assert.equal(r.allowed, false);
  });

  it("blocks when order below min purchase", () => {
    const r = canPlacePaperBuy({
      balance: 1_000_000,
      orderValue: 10_000,
      holdingsCount: 0,
      settings: baseSettings,
    });
    assert.equal(r.allowed, false);
    assert.match(r.message ?? "", /min purchase/i);
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
