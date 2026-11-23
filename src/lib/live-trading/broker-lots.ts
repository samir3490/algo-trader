/**
 * Normalize Zerodha holdings / positions into sellable lots with avg + LTP.
 * Holdings qty must include t1_quantity (same as /api/zerodha/holdings).
 */

export interface BrokerLot {
  symbol: string;
  exchange: string;
  qty: number;
  avgPrice: number;
  ltp: number;
  product: string;
  source: "position" | "holding";
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Sellable CNC holding qty (settled + T1), matching the holdings UI. */
export function holdingSellableQty(h: Record<string, unknown>): number {
  const settled = num(h.quantity ?? h.qty);
  const t1 = num(h.t1_quantity);
  return Math.max(0, Math.floor(settled + t1));
}

export function lotsFromKiteHoldings(raw: unknown): BrokerLot[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: BrokerLot[] = [];
  for (const row of list) {
    const h = row as Record<string, unknown>;
    const symbol = String(h.tradingsymbol || h.symbol || "")
      .trim()
      .toUpperCase();
    if (!symbol) continue;
    const qty = holdingSellableQty(h);
    if (qty <= 0) continue;
    const avgPrice = num(h.average_price ?? h.avg_price ?? h.avgPrice);
    const ltp = num(h.last_price ?? h.lastPrice ?? h.ltp) || avgPrice;
    out.push({
      symbol,
      exchange: String(h.exchange || "NSE").trim().toUpperCase() || "NSE",
      qty,
      avgPrice,
      ltp,
      product: "CNC",
      source: "holding",
    });
  }
  return out;
}

export function lotsFromKitePositions(raw: unknown): BrokerLot[] {
  const net =
    raw && typeof raw === "object" && Array.isArray((raw as { net?: unknown }).net)
      ? ((raw as { net: Record<string, unknown>[] }).net)
      : Array.isArray(raw)
        ? (raw as Record<string, unknown>[])
        : [];
  const out: BrokerLot[] = [];
  for (const p of net) {
    const symbol = String(p.tradingsymbol || p.symbol || "")
      .trim()
      .toUpperCase();
    if (!symbol) continue;
    const qty = Math.floor(num(p.quantity ?? p.qty));
    if (qty <= 0) continue;
    const avgPrice = num(p.average_price ?? p.avg_price ?? p.avgPrice);
    const ltp = num(p.last_price ?? p.lastPrice ?? p.ltp) || avgPrice;
    out.push({
      symbol,
      exchange: String(p.exchange || "NSE").trim().toUpperCase() || "NSE",
      qty,
      avgPrice,
      ltp,
      product: String(p.product || "CNC").trim().toUpperCase() || "CNC",
      source: "position",
    });
  }
  return out;
}

/** Prefer product match; else any lot for the symbol. */
export function findSellLot(
  lots: BrokerLot[],
  symbol: string,
  product?: string
): BrokerLot | null {
  const sym = symbol.trim().toUpperCase();
  const prod = (product || "").trim().toUpperCase();
  if (prod) {
    const match = lots.find((l) => l.symbol === sym && l.product === prod);
    if (match) return match;
  }
  return lots.find((l) => l.symbol === sym) ?? null;
}
