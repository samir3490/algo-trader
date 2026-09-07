import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "@/lib/firebase";
import {
  effectivePositionSizingMode,
  normalizeAppSettings,
  resolvePaperBuyNotional,
  SIMPLE_PAPER_MAX_POSITIONS,
  SIMPLE_PAPER_ORDER_NOTIONAL,
} from "./normalize-settings";

describe("normalizeAppSettings", () => {
  it("forces fixed 1L notional sizing when rule is on", () => {
    const out = normalizeAppSettings({
      ...DEFAULT_SETTINGS,
      ruleFixedNotional1L: true,
      positionSizingMode: "atr_risk",
      paperOrderNotional: 500_000,
      paperMaxOrderValue: 500_000,
    });
    assert.equal(out.positionSizingMode, "notional");
    assert.equal(out.paperOrderNotional, SIMPLE_PAPER_ORDER_NOTIONAL);
  });

  it("honors custom notional when Fixed ₹1L rule is off", () => {
    const out = normalizeAppSettings({
      ...DEFAULT_SETTINGS,
      ruleFixedNotional1L: false,
      positionSizingMode: "portfolio_pct",
      paperOrderNotional: 50_000,
      paperMaxOrderValue: 500_000,
      paperMinOrderValue: 10_000,
    });
    assert.equal(out.positionSizingMode, "portfolio_pct");
    assert.equal(out.paperOrderNotional, 50_000);
    assert.equal(out.paperMinOrderValue, 10_000);
    assert.equal(resolvePaperBuyNotional(out), 50_000);
    assert.equal(
      effectivePositionSizingMode(out),
      "portfolio_pct"
    );
  });

  it("defaults paper max per trade to 5 lakh when missing", () => {
    const out = normalizeAppSettings({
      ...DEFAULT_SETTINGS,
      paperMaxOrderValue: 0,
    });
    assert.equal(out.paperMaxOrderValue, 500_000);
  });

  it("enables basic 2% stop / 5% take-profit when rule is on", () => {
    const out = normalizeAppSettings({
      ...DEFAULT_SETTINGS,
      ruleBasicExits2and5: true,
      ruleClearRebuyLocks: true,
      ruleMaxPositions25: true,
      ruleStrategySellsOff: true,
      autoTakeProfit: false,
      autoTrailingStop: true,
      enableStrategySellSignals: true,
      rebuyCooldownMinutes: 240,
      noSameDayRebuyAfterSell: true,
      maxRoundTripsPerSymbolPerDay: 1,
      maxPositions: 5,
    });
    assert.equal(out.autoStopLoss, true);
    assert.equal(out.autoTakeProfit, true);
    assert.equal(out.stopLossPercent, 2);
    assert.equal(out.takeProfitPercent, 5);
    assert.equal(out.autoTrailingStop, true);
    assert.equal(out.trailingStopPercent, 1.5);
    assert.equal(out.enableStrategySellSignals, false);
    assert.equal(out.rebuyCooldownMinutes, 0);
    assert.equal(out.noSameDayRebuyAfterSell, false);
    assert.equal(out.maxRoundTripsPerSymbolPerDay, 0);
    assert.equal(out.maxPositions, SIMPLE_PAPER_MAX_POSITIONS);
  });

  it("preserves custom exits when basic-exits rule is off", () => {
    const out = normalizeAppSettings({
      ...DEFAULT_SETTINGS,
      ruleBasicExits2and5: false,
      ruleStrategySellsOff: false,
      ruleClearRebuyLocks: false,
      ruleMaxPositions25: false,
      autoStopLoss: false,
      autoTakeProfit: true,
      stopLossPercent: 3,
      takeProfitPercent: 8,
      enableStrategySellSignals: true,
      rebuyCooldownMinutes: 120,
      maxPositions: 8,
    });
    assert.equal(out.autoStopLoss, false);
    assert.equal(out.stopLossPercent, 3);
    assert.equal(out.takeProfitPercent, 8);
    assert.equal(out.enableStrategySellSignals, true);
    assert.equal(out.rebuyCooldownMinutes, 120);
    assert.equal(out.maxPositions, 8);
  });

  it("exports effectivePositionSizingMode helper", () => {
    assert.equal(effectivePositionSizingMode({}), "notional");
    assert.equal(
      effectivePositionSizingMode({ positionSizingMode: "atr_risk" }),
      "notional"
    );
  });
});
