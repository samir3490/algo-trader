import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveBacktestQty } from "./position-size";

describe("resolveBacktestQty", () => {
  it("uses ~10% of cash when quantity not set", () => {
    const qty = resolveBacktestQty(1_000_000, 2500);
    assert.equal(qty, 40);
  });

  it("respects explicit quantity", () => {
    assert.equal(resolveBacktestQty(1_000_000, 2500, { quantity: 5 }), 5);
  });

  it("minimum one share", () => {
    assert.equal(resolveBacktestQty(1000, 5000), 1);
  });
});
