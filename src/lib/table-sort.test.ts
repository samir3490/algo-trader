import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compareSortValues, sortRowsByKey } from "./table-sort";

describe("table-sort", () => {
  it("sorts numbers and strings", () => {
    const rows = [{ n: 3, s: "b" }, { n: 1, s: "a" }, { n: 2, s: "c" }];
    const byN = sortRowsByKey(rows, "n", "asc", { n: (r) => r.n });
    assert.deepEqual(byN.map((r) => r.n), [1, 2, 3]);
    const byS = sortRowsByKey(rows, "s", "desc", { s: (r) => r.s });
    assert.deepEqual(byS.map((r) => r.s), ["c", "b", "a"]);
  });

  it("puts nulls last", () => {
    assert.ok(compareSortValues(1, null) < 0);
    assert.ok(compareSortValues(null, 1) > 0);
  });
});
