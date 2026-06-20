import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sectorMapCoverage } from "./sector-map";

describe("sector-map", () => {
  it("maps at least 95% of Top 100 symbols", () => {
    const { mapped, total, unmapped } = sectorMapCoverage();
    assert.ok(total >= 100);
    assert.ok(
      mapped / total >= 0.95,
      `Only ${mapped}/${total} mapped; unmapped: ${unmapped.join(", ")}`
    );
  });
});
