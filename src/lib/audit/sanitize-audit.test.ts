import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeAuditEntry, sanitizeForFirestore } from "./sanitize-audit";

describe("sanitizeForFirestore", () => {
  it("removes undefined fields from objects", () => {
    const out = sanitizeForFirestore({
      a: 1,
      b: undefined,
      nested: { c: 2, d: undefined },
    }) as Record<string, unknown>;
    assert.equal(out.a, 1);
    assert.equal("b" in out, false);
    assert.deepEqual(out.nested, { c: 2 });
  });
});

describe("sanitizeAuditEntry", () => {
  it("omits meta when undefined", () => {
    const out = sanitizeAuditEntry({
      id: "audit-1",
      timestamp: "2026-01-01T00:00:00.000Z",
      severity: "INFO",
      source: "PaperTrading",
      message: "reset",
    });
    assert.equal("meta" in out, false);
  });
});
