import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isLiveOrderRecord } from "./load-live-fills";

describe("isLiveOrderRecord", () => {
  it("detects explicit LIVE mode", () => {
    assert.equal(isLiveOrderRecord({ mode: "LIVE" }), true);
    assert.equal(isLiveOrderRecord({ mode: "live" }), true);
  });

  it("rejects PAPER", () => {
    assert.equal(isLiveOrderRecord({ mode: "PAPER", id: "live-x" }), false);
  });

  it("treats live- ids and LIVE status as live when mode missing", () => {
    assert.equal(isLiveOrderRecord({ id: "live-123" }), true);
    assert.equal(isLiveOrderRecord({ status: "LIVE BUY EXECUTED" }), true);
    assert.equal(isLiveOrderRecord({ id: "t1", status: "COMPLETE" }), false);
  });
});
