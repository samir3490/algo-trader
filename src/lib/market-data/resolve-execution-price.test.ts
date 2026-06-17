import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  executionPriceDeviationPct,
  MAX_EXECUTION_HINT_DEVIATION_PCT,
} from "./resolve-execution-price";

describe("executionPriceDeviationPct", () => {
  it("flags Hindalco-style bad hint vs live market", () => {
    const deviation = executionPriceDeviationPct(2000, 670);
    assert.ok(deviation > MAX_EXECUTION_HINT_DEVIATION_PCT);
  });

  it("allows small drift between hint and live", () => {
    const deviation = executionPriceDeviationPct(672, 670);
    assert.ok(deviation < MAX_EXECUTION_HINT_DEVIATION_PCT);
  });
});
