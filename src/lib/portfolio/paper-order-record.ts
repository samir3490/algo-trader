import type { OrderRecord, PaperTrade } from "@/lib/firebase";

/** Map a paper trade row to Firestore order history shape. */
export function paperTradeToOrderRecord(
  trade: PaperTrade,
  options?: {
    product?: string;
    mode?: "PAPER" | "LIVE";
  }
): OrderRecord {
  return {
    id: trade.id,
    time: trade.time,
    symbol: trade.symbol.trim().toUpperCase(),
    exchange: (trade.exchange || "NSE").trim().toUpperCase(),
    side: trade.side,
    qty: trade.qty,
    price: trade.price,
    orderType: "MARKET",
    product: trade.product ?? options?.product ?? "CNC",
    mode: options?.mode ?? "PAPER",
    status: "EXECUTED",
    date:
      trade.date ??
      (trade.executedAt
        ? new Date(trade.executedAt).toLocaleDateString("en-CA", {
            timeZone: "Asia/Kolkata",
          })
        : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })),
    strategyId: trade.strategyId ?? trade.ownerStrategyId,
    strategyName: trade.strategyName,
    reason: trade.reason,
  };
}

export function newTradeIds(
  before: PaperTrade[],
  after: PaperTrade[]
): PaperTrade[] {
  const seen = new Set(before.map((t) => t.id));
  return after.filter((t) => t.id && !seen.has(t.id));
}
