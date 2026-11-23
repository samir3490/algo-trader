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
  entryPrice?: number;
  netPnl?: number;
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
    ...(typeof input.entryPrice === "number" && input.entryPrice > 0
      ? { entryPrice: input.entryPrice }
      : {}),
    ...(typeof input.netPnl === "number" && Number.isFinite(input.netPnl)
      ? { netPnl: input.netPnl }
      : {}),
  };
}

/**
 * Infer buy avg from risk-exit reason text when FIFO history is missing.
 * e.g. "Stop loss hit (-2.31% ≤ -2%)" + sell ₹1170 → avg ≈ 1170 / 0.9769
 */
export function inferEntryPriceFromRiskReason(
  sellPrice: number,
  reason?: string
): number | undefined {
  if (!(sellPrice > 0) || !reason) return undefined;
  const m = reason.match(
    /\(([+-]?\d+(?:\.\d+)?)\s*%\s*[≤<=≥>=]/
  );
  if (!m) return undefined;
  const pct = Number(m[1]);
  if (!Number.isFinite(pct) || pct <= -100) return undefined;
  const avg = sellPrice / (1 + pct / 100);
  return avg > 0 && Number.isFinite(avg)
    ? Math.round(avg * 100) / 100
    : undefined;
}

/** Infer strategy label from stored name or reason/meta text. */
export function inferLiveStrategyName(
  strategyName?: string,
  reason?: string
): string {
  const named = strategyName?.trim();
  if (named && named.toLowerCase() !== "manual") return named;

  const r = (reason || "").trim();
  if (!r) return named || "Manual";

  // "BUY · EMA Crossover · …" / "SELL · Live risk exit · …"
  const dotted = r.match(
    /^(?:LIVE\s+)?(?:BUY|SELL)\s*[·•|\-]\s*([^·•|\n]+)/i
  );
  if (dotted?.[1]) {
    const cand = dotted[1].trim();
    if (
      cand &&
      !/^(qty|order|₹|rs\.?|manual)\b/i.test(cand) &&
      cand.toLowerCase() !== "manual"
    ) {
      return cand;
    }
  }

  return named || "Manual";
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
    entryPrice?: number;
    netPnl?: number;
  }>
): PaperTrade[] {
  const out: PaperTrade[] = [];
  for (const o of orders) {
    const status = (o.status || "").toUpperCase().replace(/\s+/g, " ").trim();
    const qtyNum = Number(o.qty) || 0;
    const priceNum = Number(o.price) || 0;
    const filledLike =
      !status ||
      /COMPLETE|EXECUTED|FILLED/.test(status) ||
      (qtyNum > 0 &&
        priceNum > 0 &&
        !/REJECT|CANCEL|OPEN|PENDING|TRIGGER/.test(status));
    if (!filledLike) continue;
    const side = (o.side || "").toUpperCase();
    if (side !== "BUY" && side !== "SELL") continue;
    const qty = qtyNum;
    // Keep COMPLETE history rows even when avg price was saved as 0 (pre-fill).
    const price = priceNum;
    if (qty <= 0) continue;
    if (price <= 0 && !/COMPLETE|EXECUTED|FILLED/.test(status)) continue;
    const symbol = (o.symbol || "").trim().toUpperCase();
    if (!symbol) continue;
    const ms = Date.parse(o.time || "");
    const executedAt =
      Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : undefined;
    const date =
      Number.isFinite(ms) && ms > 0
        ? new Date(ms).toLocaleDateString("en-CA", { timeZone: IST })
        : undefined;

    let entryPrice =
      typeof o.entryPrice === "number" && o.entryPrice > 0
        ? o.entryPrice
        : undefined;
    let netPnl =
      typeof o.netPnl === "number" && Number.isFinite(o.netPnl)
        ? o.netPnl
        : undefined;

    if (side === "SELL" && price > 0 && qty > 0) {
      if (!entryPrice) {
        entryPrice = inferEntryPriceFromRiskReason(price, o.reason);
      }
      if (netPnl == null && entryPrice != null && entryPrice > 0) {
        netPnl = Math.round((price - entryPrice) * qty * 100) / 100;
      }
    }

    out.push({
      id: liveOrderId(o.orderId, `${symbol}-${o.time}-${side}-${qty}`),
      time: o.time,
      executedAt,
      date,
      symbol,
      exchange: (o.exchange || "NSE").trim().toUpperCase(),
      side,
      qty,
      price,
      strategyName: inferLiveStrategyName(o.strategyName, o.reason),
      reason: o.reason,
      product: o.product || "CNC",
      ...(entryPrice != null ? { entryPrice } : {}),
      ...(netPnl != null ? { netPnl } : {}),
    });
  }
  return out;
}

/** Map Firestore LIVE OrderRecords into PaperTrade rows. */
export function firestoreLiveOrdersToPaperTrades(
  orders: Array<{
    id?: string;
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
    mode?: string;
    entryPrice?: number;
    netPnl?: number;
  }>
) {
  return liveOrdersToPaperTrades(
    orders
      .filter((o) => !o.mode || o.mode === "LIVE")
      .map((o) => ({
        orderId: o.orderId || o.id,
        time: o.time,
        symbol: o.symbol,
        exchange: o.exchange,
        side: o.side,
        qty: o.qty,
        price: o.price,
        status: o.status || "COMPLETE",
        strategyName: o.strategyName,
        reason: o.reason,
        product: o.product,
        entryPrice: o.entryPrice,
        netPnl: o.netPnl,
      }))
  );
}
