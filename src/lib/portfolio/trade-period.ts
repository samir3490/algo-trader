import type { PaperTrade } from "@/lib/firebase";
import { resolveTradeCharges } from "@/lib/brokerage/trade-charges";
import { tradeExecutedAtMs } from "@/lib/paper-trades/normalize";
import {
  portfolioChartWindowDays,
  todayDateKeyIST,
  tradeDateKeyIST,
  type PortfolioChartPeriod,
} from "./compute-portfolio";

const IST = "Asia/Kolkata";

export type TradePeriodPreset = PortfolioChartPeriod | "all" | "custom";

export interface TradeDateRange {
  /** Inclusive IST date key YYYY-MM-DD, or null for open start. */
  fromKey: string | null;
  /** Inclusive IST date key YYYY-MM-DD, or null for open end. */
  toKey: string | null;
}

export interface TradePeriodTotals {
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  buyTurnover: number;
  sellTurnover: number;
  totalTurnover: number;
  /** FIFO matched realized P&L for sells closed in the range. */
  realizedPnl: number;
  wins: number;
  losses: number;
  winRate: number;
  fees: number;
  /** True when any fee in the total was estimated (Zerodha schedule). */
  feesEstimated: boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function positionKey(symbol: string, exchange: string): string {
  return `${symbol.trim().toUpperCase()}:${(exchange || "NSE").trim().toUpperCase()}`;
}

function buyCashOut(t: PaperTrade): number {
  const turnover = t.grossAmount ?? t.qty * t.price;
  return typeof t.charges === "number" ? turnover + t.charges : turnover;
}

function sellCashIn(t: PaperTrade): number {
  const turnover = t.grossAmount ?? t.qty * t.price;
  return typeof t.charges === "number" ? turnover - t.charges : turnover;
}

function tradeTurnover(t: PaperTrade): number {
  return Math.abs(t.grossAmount ?? t.qty * t.price);
}

export function shiftDateKeyIST(dateKey: string, days: number): string {
  const ms = new Date(`${dateKey}T12:00:00+05:30`).getTime() + days * 86_400_000;
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: IST });
}

export function resolveTradeDateRange(
  preset: TradePeriodPreset,
  now = new Date(),
  custom?: { from?: string; to?: string }
): TradeDateRange {
  if (preset === "all") {
    return { fromKey: null, toKey: null };
  }
  if (preset === "custom") {
    const from = (custom?.from ?? "").trim();
    const to = (custom?.to ?? "").trim();
    return {
      fromKey: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null,
      toKey: /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : null,
    };
  }
  const today = todayDateKeyIST(now);
  const days = portfolioChartWindowDays(preset);
  return {
    fromKey: shiftDateKeyIST(today, -(days - 1)),
    toKey: today,
  };
}

export function tradePeriodLabel(
  preset: TradePeriodPreset,
  range: TradeDateRange
): string {
  if (preset === "all") return "All time";
  if (preset === "week") return "Last 7 days (IST)";
  if (preset === "month") return "Last 30 days (IST)";
  if (preset === "year") return "Last 12 months (IST)";
  const from = range.fromKey ?? "…";
  const to = range.toKey ?? "…";
  if (!range.fromKey && !range.toKey) return "Custom range";
  return `${from} → ${to} (IST)`;
}

export function isTradeInDateRange(
  trade: PaperTrade,
  range: TradeDateRange
): boolean {
  const key = tradeDateKeyIST(trade);
  if (!key) return false;
  if (range.fromKey && key < range.fromKey) return false;
  if (range.toKey && key > range.toKey) return false;
  return true;
}

export function filterTradesByDateRange<T extends PaperTrade>(
  trades: T[],
  range: TradeDateRange
): T[] {
  if (!range.fromKey && !range.toKey) return [...trades];
  return trades.filter((t) => isTradeInDateRange(t, range));
}

/**
 * FIFO realized P&L attributed to sells whose trade date falls in the range.
 * Buys before the window still form cost basis (correct period P&L).
 */
export function computeFifoRealizedPnlInRange(
  trades: PaperTrade[],
  range: TradeDateRange
): { realizedPnl: number; wins: number; losses: number } {
  const sorted = [...trades].sort(
    (a, b) => tradeExecutedAtMs(a) - tradeExecutedAtMs(b)
  );
  const lots = new Map<string, { qty: number; costPerShare: number }[]>();
  let realized = 0;
  let wins = 0;
  let losses = 0;

  for (const t of sorted) {
    const key = positionKey(t.symbol, t.exchange);
    if (t.side === "BUY") {
      const list = lots.get(key) ?? [];
      const cashOut = buyCashOut(t);
      const costPerShare = t.qty > 0 ? cashOut / t.qty : t.price;
      list.push({ qty: Math.floor(t.qty), costPerShare });
      lots.set(key, list);
      continue;
    }

    let rem = Math.floor(t.qty);
    if (rem <= 0) continue;
    const proceedsPerShare = t.qty > 0 ? sellCashIn(t) / t.qty : t.price;
    const list = lots.get(key) ?? [];
    let sellPnl = 0;
    let matched = 0;
    while (rem > 0 && list.length > 0) {
      const lot = list[0];
      const take = Math.min(rem, lot.qty);
      sellPnl += (proceedsPerShare - lot.costPerShare) * take;
      matched += take;
      lot.qty -= take;
      rem -= take;
      if (lot.qty <= 0) list.shift();
    }
    lots.set(key, list);

    if (matched > 0 && isTradeInDateRange(t, range)) {
      realized += sellPnl;
      if (sellPnl > 0) wins += 1;
      else if (sellPnl < 0) losses += 1;
    }
  }

  return {
    realizedPnl: round2(realized),
    wins,
    losses,
  };
}

/**
 * Per-sell FIFO net P&L keyed by trade id (matched lots only).
 * Used to fill blank Net P&L cells when stored netPnl was dropped in merge.
 */
export function buildFifoNetPnlByTradeId(
  trades: PaperTrade[]
): Map<string, number> {
  const sorted = [...trades].sort(
    (a, b) => tradeExecutedAtMs(a) - tradeExecutedAtMs(b)
  );
  const lots = new Map<string, { qty: number; costPerShare: number }[]>();
  const byId = new Map<string, number>();

  for (const t of sorted) {
    const key = positionKey(t.symbol, t.exchange);
    if (t.side === "BUY") {
      const list = lots.get(key) ?? [];
      const cashOut = buyCashOut(t);
      const costPerShare = t.qty > 0 ? cashOut / t.qty : t.price;
      list.push({ qty: Math.floor(t.qty), costPerShare });
      lots.set(key, list);
      continue;
    }

    let rem = Math.floor(t.qty);
    if (rem <= 0) continue;
    const proceedsPerShare = t.qty > 0 ? sellCashIn(t) / t.qty : t.price;
    const list = lots.get(key) ?? [];
    let sellPnl = 0;
    let matched = 0;
    while (rem > 0 && list.length > 0) {
      const lot = list[0];
      const take = Math.min(rem, lot.qty);
      sellPnl += (proceedsPerShare - lot.costPerShare) * take;
      matched += take;
      lot.qty -= take;
      rem -= take;
      if (lot.qty <= 0) list.shift();
    }
    lots.set(key, list);
    if (matched > 0 && t.id) {
      byId.set(t.id, round2(sellPnl));
    }
  }

  return byId;
}

/** Copy trades with netPnl filled from FIFO (keeps existing netPnl when FIFO has no match). */
export function attachFifoNetPnl<T extends PaperTrade>(trades: T[]): T[] {
  const byId = buildFifoNetPnlByTradeId(trades);
  return trades.map((t) => {
    if (t.side !== "SELL") return t;
    const fifo = t.id ? byId.get(t.id) : undefined;
    if (fifo != null) return { ...t, netPnl: fifo };
    if (typeof t.netPnl === "number") return t;
    return t;
  });
}

export function computeTradePeriodTotals(
  trades: PaperTrade[],
  range: TradeDateRange
): TradePeriodTotals {
  const inRange = filterTradesByDateRange(trades, range);
  let buyCount = 0;
  let sellCount = 0;
  let buyTurnover = 0;
  let sellTurnover = 0;
  let fees = 0;
  let feesEstimated = false;

  for (const t of inRange) {
    const turnover = tradeTurnover(t);
    const charges = resolveTradeCharges(t);
    fees += charges.total;
    if (charges.estimated) feesEstimated = true;
    if (t.side === "BUY") {
      buyCount += 1;
      buyTurnover += turnover;
    } else {
      sellCount += 1;
      sellTurnover += turnover;
    }
  }

  const { realizedPnl, wins, losses } = computeFifoRealizedPnlInRange(
    trades,
    range
  );
  const closed = wins + losses;
  return {
    tradeCount: inRange.length,
    buyCount,
    sellCount,
    buyTurnover: round2(buyTurnover),
    sellTurnover: round2(sellTurnover),
    totalTurnover: round2(buyTurnover + sellTurnover),
    realizedPnl,
    wins,
    losses,
    winRate: closed > 0 ? round2((wins / closed) * 100) : 0,
    fees: round2(fees),
    feesEstimated: inRange.length > 0 && feesEstimated,
  };
}
