import type { OrderRecord, PaperTrade } from "@/lib/firebase";
import { formatDateTimeIST, formatDateTimeCompactIST } from "@/lib/utils";
import { pickRicherReason } from "@/lib/portfolio/sector-bias";

const IST = "Asia/Kolkata";

function normSymbol(s: string): string {
  return s.trim().toUpperCase();
}

function normExchange(ex: string): string {
  return (ex || "NSE").trim().toUpperCase();
}

export function isStrategyTrade(t: PaperTrade): boolean {
  return !!(
    t.ownerStrategyId ||
    t.strategyId ||
    t.strategyName?.trim() ||
    t.id?.startsWith("strat-")
  );
}

/** Stable sort key — newest first when sorted descending. */
export function tradeExecutedAtMs(t: PaperTrade): number {
  if (t.executedAt) {
    const ms = Date.parse(t.executedAt);
    if (!Number.isNaN(ms)) return ms;
  }
  const date = t.date ?? "";
  const time = t.time ?? "00:00:00";
  const parsed = Date.parse(`${date}T${time}`);
  if (!Number.isNaN(parsed)) return parsed;
  const idMs = t.id?.match(/strat-(\d+)-/)?.[1] ?? t.id?.match(/^t(\d+)$/)?.[1];
  if (idMs) return Number(idMs);
  return 0;
}

export function formatTradeDateTime(t: PaperTrade): string {
  const ms = tradeExecutedAtMs(t);
  if (ms > 0) return formatDateTimeIST(ms);
  return formatDateTimeIST(t.time, t.date);
}

export function formatTradeDateTimeCompact(t: PaperTrade): string {
  const ms = tradeExecutedAtMs(t);
  if (ms > 0) return formatDateTimeCompactIST(ms);
  return formatDateTimeCompactIST(t.time, t.date);
}

function exactFingerprint(t: PaperTrade): string {
  return [
    normSymbol(t.symbol),
    normExchange(t.exchange),
    t.side,
    t.date ?? "",
    String(t.qty),
    String(t.price),
  ].join("|");
}

/** One automated trade per symbol + side per calendar day (IST). */
function strategyDayKey(t: PaperTrade): string {
  const date =
    t.date ??
    (tradeExecutedAtMs(t) > 0
      ? new Date(tradeExecutedAtMs(t)).toLocaleDateString("en-CA", { timeZone: IST })
      : "");
  return [
    normSymbol(t.symbol),
    normExchange(t.exchange),
    t.side,
    date,
  ].join("|");
}

function pickBetterTrade(a: PaperTrade, b: PaperTrade): PaperTrade {
  const aScore =
    (a.strategyName ? 4 : 0) +
    (a.strategyId ? 2 : 0) +
    (a.reason ? 1 : 0);
  const bScore =
    (b.strategyName ? 4 : 0) +
    (b.strategyId ? 2 : 0) +
    (b.reason ? 1 : 0);
  if (bScore !== aScore) return bScore > aScore ? b : a;
  const richer = pickRicherReason(a.reason, b.reason);
  if (richer && richer !== a.reason && richer === b.reason) return b;
  if (richer && richer !== b.reason && richer === a.reason) return a;
  const winner =
    tradeExecutedAtMs(b) >= tradeExecutedAtMs(a) ? b : a;
  const other = winner === b ? a : b;
  return {
    ...winner,
    reason: pickRicherReason(winner.reason, other.reason) ?? winner.reason,
  };
}

export function orderFingerprint(o: OrderRecord): string {
  return [
    normSymbol(o.symbol),
    normExchange(o.exchange),
    o.side,
    o.date ?? "",
    String(o.qty),
    String(o.price),
  ].join("|");
}

export function isStrategyOrder(o: OrderRecord): boolean {
  return !!(
    o.strategyId ||
    o.strategyName?.trim() ||
    o.id?.startsWith("strat-")
  );
}

function strategyDayOrderKey(o: OrderRecord): string {
  return [
    normSymbol(o.symbol),
    normExchange(o.exchange),
    o.side,
    o.date ?? "",
  ].join("|");
}

function pickBetterOrder(a: OrderRecord, b: OrderRecord): OrderRecord {
  const score = (o: OrderRecord) =>
    (o.strategyName ? 4 : 0) + (o.strategyId ? 2 : 0) + (o.reason ? 1 : 0);
  const aScore = score(a);
  const bScore = score(b);
  if (bScore !== aScore) return bScore > aScore ? b : a;
  const richer = pickRicherReason(a.reason, b.reason);
  if (richer && richer !== a.reason && richer === b.reason) return b;
  if (richer && richer !== b.reason && richer === a.reason) return a;
  const aMs = Date.parse(a.time ?? "") || 0;
  const bMs = Date.parse(b.time ?? "") || 0;
  const winner = bMs >= aMs ? b : a;
  const other = winner === b ? a : b;
  return {
    ...winner,
    reason: pickRicherReason(winner.reason, other.reason) ?? winner.reason,
  };
}

/** Collapse duplicate Firestore rows and order/trade pairs (different ids, same fill). */
export function dedupeOrderRecords(orders: OrderRecord[]): OrderRecord[] {
  const byId = new Map<string, OrderRecord>();
  for (const o of orders) {
    const prev = byId.get(o.id);
    byId.set(o.id, prev ? pickBetterOrder(prev, o) : o);
  }

  const exactMap = new Map<string, OrderRecord>();
  for (const o of byId.values()) {
    const fp = orderFingerprint(o);
    const prev = exactMap.get(fp);
    exactMap.set(fp, prev ? pickBetterOrder(prev, o) : o);
  }

  const strategyDayMap = new Map<string, OrderRecord>();
  const manual: OrderRecord[] = [];
  for (const o of exactMap.values()) {
    if (!isStrategyOrder(o)) {
      manual.push(o);
      continue;
    }
    const key = strategyDayOrderKey(o);
    const prev = strategyDayMap.get(key);
    strategyDayMap.set(key, prev ? pickBetterOrder(prev, o) : o);
  }

  return [...manual, ...strategyDayMap.values()];
}

/** Fill strategyId / strategyName from Firestore order history. */
export function backfillStrategyFromOrders(
  trades: PaperTrade[],
  orders: OrderRecord[]
): PaperTrade[] {
  const byFp = new Map<string, OrderRecord>();
  for (const o of orders) {
    if (!o.strategyName && !o.strategyId) continue;
    const fp = orderFingerprint(o);
    if (!byFp.has(fp)) byFp.set(fp, o);
  }

  return trades.map((t) => {
    if (t.strategyName?.trim() && t.strategyId) return t;
    const match = byFp.get(exactFingerprint(t));
    if (!match) {
      if (isStrategyTrade(t) && !t.strategyName?.trim()) {
        return { ...t, strategyName: "Auto strategy" };
      }
      return t;
    }
    return {
      ...t,
      strategyId: t.strategyId ?? match.strategyId,
      strategyName: t.strategyName?.trim() || match.strategyName || "Auto strategy",
      reason: pickRicherReason(t.reason, match.reason),
    };
  });
}

/** Remove duplicate rows from repeated scans / multi-strategy runs. */
export function dedupePaperTrades(trades: PaperTrade[]): PaperTrade[] {
  const byId = new Map<string, PaperTrade>();
  for (const t of trades) {
    const prev = byId.get(t.id);
    byId.set(t.id, prev ? pickBetterTrade(prev, t) : t);
  }
  const unique = [...byId.values()];

  const exactMap = new Map<string, PaperTrade>();
  for (const t of unique) {
    const fp = exactFingerprint(t);
    const prev = exactMap.get(fp);
    exactMap.set(fp, prev ? pickBetterTrade(prev, t) : t);
  }
  const exactDeduped = [...exactMap.values()];

  const strategyDayMap = new Map<string, PaperTrade>();
  const manual: PaperTrade[] = [];

  for (const t of exactDeduped) {
    if (!isStrategyTrade(t)) {
      manual.push(t);
      continue;
    }
    const key = strategyDayKey(t);
    const prev = strategyDayMap.get(key);
    strategyDayMap.set(key, prev ? pickBetterTrade(prev, t) : t);
  }

  return [...manual, ...strategyDayMap.values()];
}

export function sortTradesNewestFirst(trades: PaperTrade[]): PaperTrade[] {
  return [...trades].sort((a, b) => tradeExecutedAtMs(b) - tradeExecutedAtMs(a));
}

export function normalizePaperTrades(
  trades: PaperTrade[],
  orders: OrderRecord[] = []
): PaperTrade[] {
  const withMeta = trades.map((t) => {
    if (t.executedAt) return t;
    const ms = tradeExecutedAtMs(t);
    if (ms > 0) return { ...t, executedAt: new Date(ms).toISOString() };
    return t;
  });
  const backfilled = backfillStrategyFromOrders(withMeta, orders);
  const deduped = dedupePaperTrades(backfilled);
  return sortTradesNewestFirst(deduped);
}

export function tradesNormalizedChanged(
  before: PaperTrade[],
  after: PaperTrade[]
): boolean {
  if (before.length !== after.length) return true;
  const beforeById = new Map(before.map((t) => [t.id, t]));
  const afterIds = new Set(after.map((t) => t.id));
  for (const t of before) {
    if (!afterIds.has(t.id)) return true;
  }
  for (const t of after) {
    const b = beforeById.get(t.id);
    if (!b) return true;
    if (b.strategyName !== t.strategyName) return true;
    if (b.strategyId !== t.strategyId) return true;
    if (b.executedAt !== t.executedAt) return true;
  }
  return false;
}
