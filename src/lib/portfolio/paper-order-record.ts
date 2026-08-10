import type { OrderRecord, PaperTrade } from "@/lib/firebase";

const IST = "Asia/Kolkata";

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
            timeZone: IST,
          })
        : new Date().toLocaleDateString("en-CA", { timeZone: IST })),
    strategyId: trade.strategyId ?? trade.ownerStrategyId,
    strategyName: trade.strategyName,
    reason:
      trade.reason?.trim() ||
      (trade.exitReason
        ? `Exit — ${String(trade.exitReason).replace(/_/g, " ")}`
        : undefined) ||
      (trade.strategyName
        ? `${trade.side} · ${trade.strategyName}`
        : undefined),
  };
}

/** Map a Firestore order doc back into a paper trade row. */
export function orderRecordToPaperTrade(order: OrderRecord): PaperTrade {
  const ms = Date.parse(order.time ?? "");
  return {
    id: order.id,
    time: order.time,
    executedAt: Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : undefined,
    symbol: order.symbol.trim().toUpperCase(),
    exchange: (order.exchange || "NSE").trim().toUpperCase(),
    side: order.side,
    qty: order.qty,
    price: order.price,
    date:
      order.date ||
      (Number.isFinite(ms) && ms > 0
        ? new Date(ms).toLocaleDateString("en-CA", { timeZone: IST })
        : undefined),
    strategyId: order.strategyId,
    ownerStrategyId: order.strategyId,
    strategyName: order.strategyName,
    reason: order.reason,
    product: order.product,
  };
}

export function newTradeIds(
  before: PaperTrade[],
  after: PaperTrade[]
): PaperTrade[] {
  const seen = new Set(before.map((t) => t.id));
  return after.filter((t) => t.id && !seen.has(t.id));
}
