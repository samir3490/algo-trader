import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SETTINGS } from "@/lib/firebase";
import {
  automationAsAppSettings,
  resolveAutomationSettings,
} from "./automation-settings";

describe("resolveAutomationSettings", () => {
  it("paper mode uses paper fields", () => {
    const s = {
      ...DEFAULT_SETTINGS,
      enableRegimeWeighting: true,
      momentumRsiOverbought: 85,
      stopLossPercent: 2,
    };
    const r = resolveAutomationSettings(s, "paper");
    assert.equal(r.momentumRsiOverbought, 85);
    assert.equal(r.stopLossPercent, 2);
  });

  it("live mirrors paper when liveMirrorPaperAutomation is true", () => {
    const s = {
      ...DEFAULT_SETTINGS,
      liveMirrorPaperAutomation: true,
      stopLossPercent: 2,
      liveStopLossPercent: 5,
    };
    const r = resolveAutomationSettings(s, "live");
    assert.equal(r.stopLossPercent, 2);
  });

  it("live uses overrides when mirror is off", () => {
    const s = {
      ...DEFAULT_SETTINGS,
      liveMirrorPaperAutomation: false,
      stopLossPercent: 2,
      liveStopLossPercent: 4,
      liveMomentumRsiOverbought: 90,
    };
    const r = resolveAutomationSettings(s, "live");
    assert.equal(r.stopLossPercent, 4);
    assert.equal(r.momentumRsiOverbought, 90);
  });

  it("automationAsAppSettings merges resolved values", () => {
    const base = { ...DEFAULT_SETTINGS };
    const resolved = resolveAutomationSettings(base, "paper");
    const merged = automationAsAppSettings(base, resolved);
    assert.equal(merged.takeProfitPercent, resolved.takeProfitPercent);
  });
});
