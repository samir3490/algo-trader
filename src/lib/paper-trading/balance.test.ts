import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatBuyStrength,
  resolvePaperStartingBalance,
} from "./balance";

describe("resolvePaperStartingBalance", () => {
  it("uses settings value", () => {
    assert.equal(resolvePaperStartingBalance({ paperStartingBalance: 10_000_000 }), 10_000_000);
  });

  it("falls back to 10L default", () => {
    assert.equal(resolvePaperStartingBalance(null), 1_000_000);
  });
});

describe("formatBuyStrength", () => {
  it("labels by signal count", () => {
    assert.match(formatBuyStrength(1), /Single/);
    assert.match(formatBuyStrength(4), /Moderate/);
    assert.match(formatBuyStrength(6), /Strong/);
  });
});
