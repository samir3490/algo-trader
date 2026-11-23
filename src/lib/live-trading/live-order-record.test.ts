import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inferEntryPriceFromRiskReason,
  liveOrdersToPaperTrades,
} from "./live-order-record";
import {
  attachFifoNetPnl,
  computeTradePeriodTotals,
  resolveTradeDateRange,
} from "@/lib/portfolio/trade-period";

describe("inferEntryPriceFromRiskReason", () => {
  it("recovers avg from stop-loss reason percent", () => {
    const avg = inferEntryPriceFromRiskReason(
      1170,
      "Stop loss hit (-2.5% ≤ -2%)"
    );
    assert.ok(avg != null);
    assert.ok(Math.abs(avg! - 1170 / 0.975) < 0.05);
  });
});

describe("liveOrdersToPaperTrades P&L", () => {
  it("fills netPnl from stored entryPrice when no BUY history", () => {
    const trades = liveOrdersToPaperTrades([
      {
        orderId: "s1",
        time: "2026-11-23T10:00:00+05:30",
        symbol: "AXISBANK",
        side: "SELL",
        qty: 10,
        price: 1200,
        status: "COMPLETE",
        entryPrice: 1250,
        reason: "Stop loss hit (-4% ≤ -2%)",
      },
    ]);
    assert.equal(trades.length, 1);
    assert.equal(trades[0].netPnl, -500);
    assert.equal(trades[0].entryPrice, 1250);
  });

  it("infers entry + netPnl from risk reason when fields missing", () => {
    const trades = liveOrdersToPaperTrades([
      {
        orderId: "s2",
        time: "2026-11-23T10:00:00+05:30",
        symbol: "AXISBANK",
        side: "SELL",
        qty: 4,
        price: 1170,
        status: "COMPLETE",
        reason: "Stop loss hit (-2.5% ≤ -2%)",
      },
    ]);
    assert.equal(trades.length, 1);
    assert.ok(trades[0].entryPrice != null && trades[0].entryPrice > 1170);
    assert.ok(trades[0].netPnl != null && trades[0].netPnl < 0);
  });

  it("updates realized totals without matching BUY via FIFO fallback", () => {
    const trades = attachFifoNetPnl(
      liveOrdersToPaperTrades([
        {
          orderId: "s3",
          time: "2026-11-23T10:00:00+05:30",
          symbol: "AXISBANK",
          side: "SELL",
          qty: 10,
          price: 1200,
          status: "COMPLETE",
          entryPrice: 1250,
          netPnl: -500,
        },
      ])
    );
    const range = resolveTradeDateRange("all");
    const totals = computeTradePeriodTotals(trades, range);
    assert.equal(totals.realizedPnl, -500);
    assert.equal(totals.losses, 1);
    assert.equal(trades[0].netPnl, -500);
  });
});
