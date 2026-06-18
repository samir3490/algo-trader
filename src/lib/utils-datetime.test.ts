import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDateTimeIST, formatDateTimeCompactIST, parseDateTimeMs } from "./utils";

describe("formatDateTimeIST", () => {
  it("formats ISO timestamps with date and time", () => {
    const label = formatDateTimeIST("2026-05-27T10:30:00.000Z");
    assert.match(label, /2026/);
    assert.match(label, /:/);
  });

  it("combines legacy time-only values with a date", () => {
    const label = formatDateTimeIST("10:30:45", "2026-05-27");
    assert.match(label, /2026/);
    assert.match(label, /10:30:45/);
  });

  it("parseDateTimeMs sorts legacy time with date", () => {
    const a = parseDateTimeMs("09:00:00", "2026-05-27");
    const b = parseDateTimeMs("10:00:00", "2026-05-27");
    assert.ok(b > a);
  });
});

describe("formatDateTimeCompactIST", () => {
  it("omits seconds and is shorter than full format", () => {
    const iso = "2026-05-27T10:30:45.000Z";
    const full = formatDateTimeIST(iso);
    const compact = formatDateTimeCompactIST(iso);
    assert.ok(compact.length < full.length);
    assert.doesNotMatch(compact, /:45/);
  });
});
