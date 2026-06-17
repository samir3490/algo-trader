import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { countScanDigestLines } from "./scan-email-status";

describe("countScanDigestLines", () => {
  it("counts EXECUTED with strength suffix as a trade", () => {
    const counts = countScanDigestLines([
      { status: "EXECUTED · Strong" },
      { status: "EXECUTED" },
      { status: "RISK EXIT — STOP LOSS" },
      { status: "SKIPPED — gate" },
    ]);
    assert.equal(counts.executed, 2);
    assert.equal(counts.risk, 1);
    assert.equal(counts.skipped, 1);
  });
});
