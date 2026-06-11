import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "@/lib/firebase";
import { normalizeAppSettings } from "./normalize-settings";

describe("normalizeAppSettings", () => {
  it("raises maxOrderValue to at least paper notional", () => {
    const out = normalizeAppSettings({
      ...DEFAULT_SETTINGS,
      paperOrderNotional: 100_000,
      maxOrderValue: 10_000,
    });
    assert.equal(out.maxOrderValue, 100_000);
    assert.equal(out.paperOrderNotional, 100_000);
  });
});
