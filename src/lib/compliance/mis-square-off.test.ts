import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isMisProduct } from "@/lib/risk/paper-risk-guard";
import { applyMisSquareOffOnly } from "./mis-square-off";
import { createOpenPosition } from "@/lib/portfolio/position-manager";
import { DEFAULT_SETTINGS } from "@/lib/firebase";

describe("isMisProduct", () => {
  it("detects MIS on position or default", () => {
    assert.equal(isMisProduct("MIS", { paperDefaultProduct: "CNC" }), true);
    assert.equal(isMisProduct(undefined, { paperDefaultProduct: "MIS" }), true);
    assert.equal(isMisProduct("CNC", { paperDefaultProduct: "CNC" }), false);
  });
});

describe("applyMisSquareOffOnly", () => {
  it("skips before square-off time", () => {
    const pos = createOpenPosition({
      symbol: "RELIANCE",
      exchange: "NSE",
      quantity: 10,
      entryPrice: 2500,
      ltp: 2510,
      ownerStrategyId: "s1",
      product: "MIS",
    });
    const noon = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
    );
    noon.setHours(12, 0, 0, 0);
    const result = applyMisSquareOffOnly(
      { balance: 1_000_000, holdings: [], positions: [pos], trades: [] },
      { ...DEFAULT_SETTINGS, squareOffTime: "15:15", paperDefaultProduct: "CNC" },
      noon
    );
    assert.equal(result.exits.length, 0);
    assert.ok(result.skippedReason?.includes("Before square-off"));
  });
});
