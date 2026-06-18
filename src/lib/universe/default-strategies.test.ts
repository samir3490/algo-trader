import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildNifty50UniverseStrategies } from "./default-strategies";
import { STRATEGY_DEFINITIONS } from "@/lib/strategies/definitions";
import { NIFTY50_SYMBOLS } from "@/lib/universe/symbol-lists";

describe("buildNifty50UniverseStrategies", () => {
  it("creates one universe instance per strategy type", () => {
    const items = buildNifty50UniverseStrategies();
    assert.equal(items.length, STRATEGY_DEFINITIONS.length);
    assert.equal(items[0].symbols?.length, NIFTY50_SYMBOLS.length);
    assert.equal(items[0].universe, "nifty50");
    assert.ok(items.every((s) => s.status === "running"));
    assert.ok(items.every((s) => !s.universeTopN));
  });
});
