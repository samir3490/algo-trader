import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "@/lib/firebase";
import {
  effectivePositionSizingMode,
  normalizeAppSettings,
  SIMPLE_PAPER_MAX_POSITIONS,
  SIMPLE_PAPER_ORDER_NOTIONAL,
} from "./normalize-settings";

describe("normalizeAppSettings", () => {
  it("forces fixed 1L notional sizing", () => {
    const out = normalizeAppSettings({
      ...DEFAULT_SETTINGS,
      positionSizingMode: "atr_risk",
      paperOrderNotional: 500_000,
      paperMaxOrderValue: 500_000,
    });
    assert.equal(out.positionSizingMode, "notional");
    assert.equal(out.paperOrderNotional, SIMPLE_PAPER_ORDER_NOTIONAL);
  });

  it("defaults paper max per trade to 5 lakh when missing", () => {
    const out = normalizeAppSettings({
      ...DEFAULT_SETTINGS,
      paperMaxOrderValue: 0,
    });
    assert.equal(out.paperMaxOrderValue, 500_000);
  });

  it("enables basic 2% stop / 5% take-profit and clears blockages", () => {
    const out = normalizeAppSettings({
      ...DEFAULT_SETTINGS,
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
    assert.equal(out.autoTrailingStop, false);
    assert.equal(out.enableStrategySellSignals, false);
    assert.equal(out.rebuyCooldownMinutes, 0);
    assert.equal(out.noSameDayRebuyAfterSell, false);
    assert.equal(out.maxRoundTripsPerSymbolPerDay, 0);
    assert.equal(out.maxPositions, SIMPLE_PAPER_MAX_POSITIONS);
  });

  it("exports effectivePositionSizingMode helper", () => {
    assert.equal(effectivePositionSizingMode({}), "notional");
    assert.equal(
      effectivePositionSizingMode({ positionSizingMode: "atr_risk" }),
      "notional"
    );
  });
});
