import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  exitCategoryLabel,
  normalizeExitReasonLabel,
} from "./exit-label";

describe("exit labels", () => {
  it("calls profitable sales profit exits", () => {
    assert.equal(
      exitCategoryLabel({ reason: "take_profit", pnlPercent: 5 }),
      "PROFIT EXIT"
    );
    assert.equal(
      exitCategoryLabel({ reason: "trailing_stop", pnlPercent: 2.1 }),
      "PROFIT EXIT"
    );
  });

  it("keeps loss exits as risk exits", () => {
    assert.equal(
      exitCategoryLabel({ reason: "stop_loss", pnlPercent: -2 }),
      "RISK EXIT"
    );
  });

  it("corrects legacy take-profit wording", () => {
    assert.equal(
      normalizeExitReasonLabel("RISK EXIT — Take profit hit (5.20%)"),
      "PROFIT EXIT — Take profit hit (5.20%)"
    );
  });
});
