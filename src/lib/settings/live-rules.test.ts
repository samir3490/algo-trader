import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SETTINGS } from "@/lib/firebase";
import {
  LIVE_RULE_CATALOG,
  PAPER_TO_LIVE_RULE,
  isLiveRuleOn,
} from "./live-rules";
import { PAPER_RULE_CATALOG, isPaperRuleOn } from "./paper-rules";
import { normalizeAppSettings } from "./normalize-settings";
import { resolveAutomationSettings } from "./automation-settings";

describe("live rules parity / regression", () => {
  it("catalog has master kill switch default off", () => {
    const master = LIVE_RULE_CATALOG.find((r) => r.key === "liveAutoTradingEnabled");
    assert.ok(master);
    assert.equal(master!.defaultOn, false);
    assert.equal(isLiveRuleOn(DEFAULT_SETTINGS, "liveAutoTradingEnabled"), false);
  });

  it("copies every paper rule with the same defaultOn", () => {
    for (const paper of PAPER_RULE_CATALOG) {
      const liveKey = PAPER_TO_LIVE_RULE[paper.key];
      const live = LIVE_RULE_CATALOG.find((r) => r.key === liveKey);
      assert.ok(live, `missing live rule for ${paper.key}`);
      assert.equal(
        live!.defaultOn,
        paper.defaultOn,
        `${paper.key} → ${liveKey} default mismatch`
      );
      assert.equal(
        isLiveRuleOn(DEFAULT_SETTINGS, liveKey),
        isPaperRuleOn(DEFAULT_SETTINGS, paper.key),
        `${paper.key} DEFAULT_SETTINGS mismatch`
      );
    }
  });

  it("defaults enable capital limits and quality gates", () => {
    assert.equal(isLiveRuleOn(DEFAULT_SETTINGS, "liveRuleEnforceCapitalLimits"), true);
    assert.equal(isLiveRuleOn(DEFAULT_SETTINGS, "liveRuleMinBuySignals3"), true);
    assert.equal(isLiveRuleOn(DEFAULT_SETTINGS, "liveRulePreferStrongSectors"), true);
    assert.equal(isLiveRuleOn(DEFAULT_SETTINGS, "liveRuleMaxPositions10"), true);
    assert.equal(isLiveRuleOn(DEFAULT_SETTINGS, "liveRuleBasicExits2and5"), true);
    assert.equal(isLiveRuleOn(DEFAULT_SETTINGS, "liveRuleFixedOrderNotional"), true);
  });

  it("normalize applies live exits independently of paper exits", () => {
    const before = {
      ...DEFAULT_SETTINGS,
      ruleBasicExits2and5: false,
      stopLossPercent: 9,
      takeProfitPercent: 20,
      liveRuleBasicExits2and5: true,
      liveRuleMaxPositions10: true,
      liveMirrorPaperAutomation: false,
    };
    const after = normalizeAppSettings(before);
    assert.equal(after.stopLossPercent, 9);
    assert.equal(after.takeProfitPercent, 20);
    assert.equal(after.liveStopLossPercent, 2);
    assert.equal(after.liveTakeProfitPercent, 5);
    assert.equal(after.liveMaxPositions, 10);
    assert.equal(after.liveMirrorPaperAutomation, false);
  });

  it("live automation stays independent when mirror is off", () => {
    const s = {
      ...DEFAULT_SETTINGS,
      liveMirrorPaperAutomation: false,
      stopLossPercent: 2,
      liveStopLossPercent: 7,
      liveMaxPositions: 3,
    };
    const live = resolveAutomationSettings(s, "live");
    const paper = resolveAutomationSettings(s, "paper");
    assert.equal(paper.stopLossPercent, 2);
    assert.equal(live.stopLossPercent, 7);
    assert.equal(live.maxPositions, 3);
  });

  it("live rule keys do not overlap paper rule keys", () => {
    const paperKeys = new Set(PAPER_RULE_CATALOG.map((r) => r.key));
    for (const r of LIVE_RULE_CATALOG) {
      assert.equal(paperKeys.has(r.key as never), false, r.key);
    }
  });

  it("DEFAULT_SETTINGS includes live capital defaults", () => {
    assert.equal(DEFAULT_SETTINGS.liveOrderNotional, 5_000);
    assert.equal(DEFAULT_SETTINGS.liveCapitalLimit, 50_000);
    assert.equal(DEFAULT_SETTINGS.liveAutoTradingEnabled, false);
  });
});
