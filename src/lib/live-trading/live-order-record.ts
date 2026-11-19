import type { OrderRecord, PaperTrade } from "@/lib/firebase";

const IST = "Asia/Kolkata";

export function liveOrderId(orderId?: string, fallback?: string): string {
  if (orderId?.trim()) return `live-${orderId.trim()}`;
  return fallback?.trim() || `live-${Date.now()}`;
}

/** Build a Firestore order history row for a live fill. */
export function buildLiveOrderRecord(input: {
  orderId?: string;
  symbol: string;
  exchange?: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  product?: string;
  orderType?: string;
  status?: string;
  strategyName?: string;
  reason?: string;
  time?: string;
}): OrderRecord {
  const now = input.time?.trim() || new Date().toISOString();
  const date = new Date(now).toLocaleDateString("en-CA", { timeZone: IST });
  const strategyName = input.strategyName?.trim() || "Manual";
  return {
    id: liveOrderId(input.orderId),
    time: now,
    symbol: input.symbol.trim().toUpperCase(),
    exchange: (input.exchange || "NSE").trim().toUpperCase(),
    side: input.side,
    qty: input.qty,
    price: input.price,
    orderType: input.orderType || "MARKET",
    product: input.product || "CNC",
    mode: "LIVE",
    status: input.status || "COMPLETE",
    orderId: input.orderId,
    date,
    strategyName,
    reason:
      input.reason?.trim() ||
      `${input.side} · ${strategyName}`,
  };
}

/** Map live order rows into PaperTrade shape for shared strategy/P&L helpers. */
export function liveOrdersToPaperTrades(
  orders: Array<{
    orderId?: string;
    time: string;
    symbol: string;
    exchange?: string;
    side: string;
    qty: number;
    price: number;
    status?: string;
    strategyName?: string;
    reason?: string;
    product?: string;
  }>
): PaperTrade[] {
  const out: PaperTrade[] = [];
  for (const o of orders) {
    const status = (o.status || "").toUpperCase();
    if (status && !["COMPLETE", "EXECUTED"].includes(status)) continue;
    const side = (o.side || "").toUpperCase();
    if (side !== "BUY" && side !== "SELL") continue;
    const qty = Number(o.qty) || 0;
    const price = Number(o.price) || 0;
    if (qty <= 0 || price < 0) continue;
    const symbol = (o.symbol || "").trim().toUpperCase();
    if (!symbol) continue;
    const ms = Date.parse(o.time || "");
    out.push({
      id: liveOrderId(o.orderId, `${symbol}-${o.time}-${side}-${qty}`),
      time: o.time,
      executedAt:
        Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : undefined,
      symbol,
      exchange: (o.exchange || "NSE").trim().toUpperCase(),
      side,
      qty,
      price,
      strategyName: o.strategyName?.trim() || "Manual",
      reason: o.reason,
      product: o.product || "CNC",
    });
  }
  return out;
}
