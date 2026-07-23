import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "@/lib/firebase";
import {
  effectivePositionSizingMode,
  normalizeAppSettings,
} from "./normalize-settings";

describe("normalizeAppSettings", () => {
  it("normalizes paper max per trade with minimum 1000", () => {
    const out = normalizeAppSettings({
      ...DEFAULT_SETTINGS,
      paperOrderNotional: 100_000,
      paperMaxOrderValue: 10_000,
    });
    assert.equal(out.paperMaxOrderValue, 10_000);
    assert.equal(out.paperOrderNotional, 100_000);
  });

  it("defaults paper max per trade to 5 lakh when missing", () => {
    const out = normalizeAppSettings({
      ...DEFAULT_SETTINGS,
      paperMaxOrderValue: 0,
    });
    assert.equal(out.paperMaxOrderValue, 500_000);
  });

  it("normalizes paper min per trade and caps at max", () => {
    const out = normalizeAppSettings({
      ...DEFAULT_SETTINGS,
      paperMaxOrderValue: 100_000,
      paperMinOrderValue: 200_000,
    });
    assert.equal(out.paperMinOrderValue, 100_000);
  });

  it("defaults paper min per trade to 25k", () => {
    const out = normalizeAppSettings({
      ...DEFAULT_SETTINGS,
      paperMinOrderValue: undefined as unknown as number,
    });
    assert.equal(out.paperMinOrderValue, 25_000);
  });

  it("coerces atr_risk and portfolio_pct 10% to notional for reliable fills", () => {
    const atr = normalizeAppSettings({
      ...DEFAULT_SETTINGS,
      positionSizingMode: "atr_risk",
    });
    assert.equal(atr.positionSizingMode, "notional");

    const pct = normalizeAppSettings({
      ...DEFAULT_SETTINGS,
      positionSizingMode: "portfolio_pct",
      positionPct: 10,
    });
    assert.equal(pct.positionSizingMode, "notional");
  });

  it("keeps portfolio_pct above 10%", () => {
    const out = normalizeAppSettings({
      ...DEFAULT_SETTINGS,
      positionSizingMode: "portfolio_pct",
      positionPct: 15,
    });
    assert.equal(out.positionSizingMode, "portfolio_pct");
  });

  it("enables basic 2% stop / 5% take-profit exits", () => {
    const out = normalizeAppSettings({
      ...DEFAULT_SETTINGS,
      autoTakeProfit: false,
      autoTrailingStop: true,
      enableStrategySellSignals: true,
    });
    assert.equal(out.autoStopLoss, true);
    assert.equal(out.autoTakeProfit, true);
    assert.equal(out.stopLossPercent, 2);
    assert.equal(out.takeProfitPercent, 5);
    assert.equal(out.autoTrailingStop, false);
    assert.equal(out.enableStrategySellSignals, false);
  });

  it("exports effectivePositionSizingMode helper", () => {
    assert.equal(
      effectivePositionSizingMode({
        positionSizingMode: "portfolio_pct",
        positionPct: 10,
      }),
      "notional"
    );
    assert.equal(
      effectivePositionSizingMode({
        positionSizingMode: "notional",
        positionPct: 10,
      }),
      "notional"
    );
  });
});
