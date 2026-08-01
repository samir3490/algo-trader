import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildWeeklyShortlistReport,
  mergeScanIntoDayRollup,
  mondayOfWeekIST,
  pruneShortlistDayRollups,
  shouldSendWeeklyShortlist,
  weekKeyIST,
} from "./weekly-shortlist";
import type { ScanDiagnostics } from "@/lib/strategies/scan-diagnostics";

function diag(partial: Partial<ScanDiagnostics>): ScanDiagnostics {
  return {
    buySignals: 0,
    sellSignals: 0,
    buyDecisions: 0,
    sellDecisions: 0,
    skippedDecisions: 0,
    gateBlocked: 0,
    riskBlocked: 0,
    dedupeBlocked: 0,
    liveSignals: 0,
    paperSignals: 0,
    skipReasons: {},
    ...partial,
  };
}

describe("weekly-shortlist", () => {
  it("computes Monday week key in IST", () => {
    // Wednesday 2026-07-29 IST
    const wed = new Date("2026-07-29T10:00:00+05:30");
    assert.equal(mondayOfWeekIST(wed), "2026-07-27");
    assert.equal(weekKeyIST(wed), "2026-07-27");
  });

  it("dedupes weekly send by week key", () => {
    const wed = new Date("2026-07-29T10:00:00+05:30");
    assert.equal(shouldSendWeeklyShortlist(undefined, wed), true);
    assert.equal(shouldSendWeeklyShortlist("2026-07-27", wed), false);
    assert.equal(shouldSendWeeklyShortlist("2026-07-20", wed), true);
  });

  it("merges ranked buys, fills, and skip reasons", () => {
    const first = mergeScanIntoDayRollup(
      undefined,
      diag({
        buySignals: 2,
        rankedBuyCandidates: [
          { symbol: "RELIANCE", signalCount: 3 },
          { symbol: "TCS", signalCount: 2 },
        ],
        details: {
          paperExec: [{ symbol: "RELIANCE", meta: "BUY · SMA · turnover ₹1L" }],
          deferred: [{ symbol: "TCS", meta: "Lower buy rank — max 25 positions" }],
        },
        skipReasons: { "Lower buy rank — max 25 positions": 1 },
      }),
      { dateIST: "2026-07-28", ranAt: "2026-07-28T04:00:00Z", tradesExecuted: 1 }
    );

    assert.equal(first.scanCount, 1);
    assert.equal(first.bought.length, 1);
    assert.equal(first.bought[0].symbol, "RELIANCE");
    assert.equal(first.notBought.length, 1);
    assert.equal(first.notBought[0].symbol, "TCS");
    assert.match(first.notBought[0].reason, /Lower buy rank|max/);

    const second = mergeScanIntoDayRollup(
      first,
      diag({
        buySignals: 1,
        rankedBuyCandidates: [{ symbol: "TCS", signalCount: 4 }],
        details: {
          paperExec: [{ symbol: "TCS", meta: "BUY · RSI" }],
        },
        skipReasons: {},
      }),
      { dateIST: "2026-07-28", ranAt: "2026-07-28T05:00:00Z", tradesExecuted: 1 }
    );

    assert.equal(second.scanCount, 2);
    assert.ok(second.bought.some((b) => b.symbol === "TCS"));
    assert.equal(
      second.notBought.find((n) => n.symbol === "TCS"),
      undefined
    );
    assert.equal(
      second.ranked.find((r) => r.symbol === "TCS")?.signalCount,
      4
    );
  });

  it("builds weekly report from day rollups", () => {
    const day = mergeScanIntoDayRollup(
      undefined,
      diag({
        buySignals: 2,
        rankedBuyCandidates: [
          { symbol: "INFY", signalCount: 2 },
          { symbol: "WIPRO", signalCount: 1 },
        ],
        details: {
          paperExec: [{ symbol: "INFY", meta: "BUY · MACD" }],
          gateBlocked: [
            { symbol: "WIPRO", meta: "Already holding — no add-on buy" },
          ],
        },
        skipReasons: { "Already holding — no add-on buy": 1 },
      }),
      { dateIST: "2026-07-28", ranAt: "x", tradesExecuted: 1 }
    );

    const report = buildWeeklyShortlistReport(
      { "2026-07-28": day },
      new Date("2026-08-02T12:00:00+05:30") // Sunday of that week
    );

    assert.equal(report.weekKey, "2026-07-27");
    assert.equal(report.bought.length, 1);
    assert.equal(report.bought[0].symbol, "INFY");
    assert.ok(report.notBought.some((n) => n.symbol === "WIPRO"));
    assert.ok(report.topSkipReasons.some((r) => /holding/i.test(r.reason)));
  });

  it("prunes old day rollups", () => {
    const pruned = pruneShortlistDayRollups(
      {
        "2026-06-01": {
          dateIST: "2026-06-01",
          lastRanAt: "x",
          scanCount: 1,
          buySignals: 0,
          tradesExecuted: 0,
          ranked: [],
          bought: [],
          notBought: [],
          skipReasonTotals: {},
        },
        "2026-07-28": {
          dateIST: "2026-07-28",
          lastRanAt: "x",
          scanCount: 1,
          buySignals: 0,
          tradesExecuted: 0,
          ranked: [],
          bought: [],
          notBought: [],
          skipReasonTotals: {},
        },
      },
      new Date("2026-08-01T12:00:00+05:30")
    );
    assert.equal(pruned["2026-06-01"], undefined);
    assert.ok(pruned["2026-07-28"]);
  });
});
