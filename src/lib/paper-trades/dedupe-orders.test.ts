import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { OrderRecord } from "@/lib/firebase";
import { dedupeOrderRecords, orderFingerprint } from "./normalize";

function order(partial: Partial<OrderRecord> & Pick<OrderRecord, "id">): OrderRecord {
  return {
    time: "2026-05-27 10:00:00",
    symbol: "RELIANCE",
    exchange: "NSE",
    side: "BUY",
    qty: 10,
    price: 2500,
    orderType: "MARKET",
    product: "CNC",
    mode: "PAPER",
    status: "EXECUTED",
    date: "2026-05-27",
    ...partial,
  };
}

describe("dedupeOrderRecords", () => {
  it("collapses order + trade rows with different ids but same fill", () => {
    const fsOrder = order({
      id: "strat-111-RELIANCE",
      strategyName: "Momentum",
      strategyId: "s1",
    });
    const tradeOrder = order({
      id: "strat-111-abc123-RELIANCE",
    });
    const deduped = dedupeOrderRecords([fsOrder, tradeOrder]);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].strategyName, "Momentum");
  });

  it("collapses repeated cron order docs for same strategy day", () => {
    const a = order({
      id: "strat-1-RELIANCE",
      price: 2500,
      qty: 10,
      strategyName: "A",
    });
    const b = order({
      id: "strat-2-RELIANCE",
      price: 2501,
      qty: 12,
      strategyName: "B",
    });
    const deduped = dedupeOrderRecords([a, b]);
    assert.equal(deduped.length, 1);
    assert.equal(deduped[0].strategyName, "B");
  });

  it("keeps distinct manual sells on same symbol and day", () => {
    const buy = order({ id: "buy-1", side: "BUY" });
    const sell = order({ id: "sell-1", side: "SELL", qty: 5, price: 2550 });
    const deduped = dedupeOrderRecords([buy, sell]);
    assert.equal(deduped.length, 2);
    assert.equal(orderFingerprint(buy) === orderFingerprint(sell), false);
  });
});
