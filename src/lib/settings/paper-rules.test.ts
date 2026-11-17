import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "@/lib/firebase";
import {
  isPaperRuleOn,
  PAPER_RULE_CATALOG,
  paperRulesSnapshot,
} from "./paper-rules";

describe("paper-rules", () => {
  it("lists all applied paper rules", () => {
    assert.ok(PAPER_RULE_CATALOG.length >= 10);
    assert.ok(PAPER_RULE_CATALOG.every((r) => r.label && r.description));
  });

  it("defaults missing flags from catalog", () => {
    assert.equal(isPaperRuleOn({}, "rulePreferStrongSectors"), true);
    assert.equal(isPaperRuleOn({}, "ruleMinBuySignals2"), true);
    assert.equal(isPaperRuleOn({}, "ruleClearRebuyLocks"), false);
    assert.equal(
      isPaperRuleOn({ rulePreferStrongSectors: false }, "rulePreferStrongSectors"),
      false
    );
  });

  it("snapshots defaults from DEFAULT_SETTINGS", () => {
    const snap = paperRulesSnapshot(DEFAULT_SETTINGS);
    assert.equal(snap.ruleFixedNotional1L, true);
    assert.equal(snap.rulePreferStrongSectors, true);
    assert.equal(snap.ruleMinBuySignals2, true);
    assert.equal(snap.ruleClearRebuyLocks, false);
    assert.equal(snap.ruleMaxPositions25, true);
  });
});
