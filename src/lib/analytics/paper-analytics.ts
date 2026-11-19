import type { PaperTrade } from "@/lib/firebase";
import type { PortfolioHolding } from "@/lib/portfolio/compute-portfolio";
import {
  computeFifoRealizedPnl,
  computePnlBreakdown,
  tradeDateKeyIST,
} from "@/lib/portfolio/compute-portfolio";
import { attachFifoNetPnl } from "@/lib/portfolio/trade-period";
import { tradeExecutedAtMs } from "@/lib/paper-trades/normalize";
import { enrichTradesWithStrategy } from "@/lib/strategies/strategy-performance";
import {
  computeRiskMetrics,
  type EquityPoint,
  type RiskMetrics,
  type RoundTripPnl,
} from "./risk-metrics";

const IST = "Asia/Kolkata";

export interface GroupedAnalytics {
  key: string;
  label: string;
  metrics: RiskMetrics;
  roundTrips: number;
}

export interface PaperPortfolioAnalytics {
  overall: RiskMetrics;
  equityCurve: EquityPoint[];
  byStrategy: GroupedAnalytics[];
  bySymbol: GroupedAnalytics[];
  byMonth: GroupedAnalytics[];
  pnlBreakdown: ReturnType<typeof computePnlBreakdown>;
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

/** Full cost-basis + mark-to-market equity series from trade history. */
export function buildPaperEquityCurve(
  trades: PaperTrade[],
  holdings: PortfolioHolding[],
  balance: number,
  startingBalance: number
): EquityPoint[] {
  const sorted = [...trades].sort(
    (a, b) => tradeExecutedAtMs(a) - tradeExecutedAtMs(b)
  );
  const lots = new Map<string, { qty: number; costPerShare: number }[]>();
  let runBalance = startingBalance;

  function investedAtCost(): number {
    let sum = 0;
    for (const list of lots.values()) {
      for (const lot of list) sum += lot.qty * lot.costPerShare;
    }
    return sum;
  }

  const points: EquityPoint[] = [];
  const startMs = Date.now();
  points.push({
    timestamp: new Date(startMs).toISOString(),
    ms: startMs,
    equity: startingBalance,
  });

  for (const t of sorted) {
    const key = positionKey(t.symbol, t.exchange);
    if (t.side === "BUY") {
      runBalance -= buyCashOut(t);
      const list = lots.get(key) ?? [];
      const costPerShare = t.qty > 0 ? buyCashOut(t) / t.qty : t.price;
      list.push({ qty: t.qty, costPerShare });
      lots.set(key, list);
    } else {
      let sellQty = t.qty;
      const list = lots.get(key) ?? [];
      while (sellQty > 0 && list.length > 0) {
        const lot = list[0];
        const take = Math.min(sellQty, lot.qty);
        lot.qty -= take;
        sellQty -= take;
        if (lot.qty <= 0) list.shift();
      }
      lots.set(key, list);
      runBalance += sellCashIn(t);
    }

    const ms = tradeExecutedAtMs(t);
    points.push({
      timestamp: ms > 0 ? new Date(ms).toISOString() : t.date ?? "",
      ms: ms > 0 ? ms : points[points.length - 1]?.ms ?? startMs,
      equity: runBalance + investedAtCost(),
    });
  }

  const mtm =
    balance +
    holdings.reduce(
      (s, h) => s + h.qty * (h.ltp > 0 ? h.ltp : h.avgPrice),
      0
    );
  const last = points[points.length - 1];
  if (!last || Math.abs(last.equity - mtm) > 1) {
    points.push({
      timestamp: new Date().toISOString(),
      ms: Date.now(),
      equity: mtm,
    });
  }

  return points;
}

function closedAtMs(t: PaperTrade): number {
  const ms = tradeExecutedAtMs(t);
  if (ms > 0) return ms;
  if (t.date) {
    const fallback = Date.parse(`${t.date}T12:00:00+05:30`);
    if (!Number.isNaN(fallback)) return fallback;
  }
  return 0;
}

/** Extract closed round-trip P&L from sells (FIFO fills missing/stale netPnl). */
export function extractRoundTrips(trades: PaperTrade[]): RoundTripPnl[] {
  const withPnl = attachFifoNetPnl(trades);
  const enriched = enrichTradesWithStrategy(withPnl);
  const trips: RoundTripPnl[] = [];
  for (const t of enriched) {
    if (t.side !== "SELL") continue;
    const ms = closedAtMs(t);
    const pnl = typeof t.netPnl === "number" ? t.netPnl : 0;
    trips.push({
      symbol: t.symbol,
      exchange: t.exchange,
      pnl,
      closedAtMs: ms,
      strategyName: t.displayStrategyName,
    });
  }
  return trips;
}

function metricsForRoundTrips(
  trips: RoundTripPnl[],
  startingEquity: number
): RiskMetrics {
  let equity = startingEquity;
  const curve: EquityPoint[] = [
    { timestamp: "", ms: 0, equity: startingEquity },
  ];
  const sorted = [...trips].sort((a, b) => a.closedAtMs - b.closedAtMs);
  for (const rt of sorted) {
    equity += rt.pnl;
    curve.push({
      timestamp: new Date(rt.closedAtMs).toISOString(),
      ms: rt.closedAtMs,
      equity,
    });
  }
  return computeRiskMetrics(curve, trips, startingEquity);
}

export function monthKeyIST(ms: number): string {
  if (ms <= 0) return "unknown";
  return new Date(ms).toLocaleDateString("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
  });
}

/** Human label for `YYYY-MM` month keys (IST). */
export function formatMonthKeyLabel(key: string): string {
  if (!/^\d{4}-\d{2}$/.test(key)) return key;
  return new Date(`${key}-01T12:00:00+05:30`).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: IST,
  });
}

/** Collapse equity curve to one point per calendar month (last value in month). */
export function aggregateEquityCurveByMonth(
  curve: EquityPoint[]
): { label: string; month: string; equity: number; ms: number }[] {
  const byMonth = new Map<string, { equity: number; ms: number }>();
  for (const p of curve) {
    const ms =
      p.ms > 0
        ? p.ms
        : p.timestamp
          ? Date.parse(p.timestamp)
          : 0;
    if (!Number.isFinite(ms) || ms <= 0) continue;
    const key = monthKeyIST(ms);
    if (key === "unknown") continue;
    const prev = byMonth.get(key);
    if (!prev || ms >= prev.ms) {
      byMonth.set(key, { equity: p.equity, ms });
    }
  }
  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({
      month,
      label: formatMonthKeyLabel(month),
      equity: Math.round(v.equity),
      ms: v.ms,
    }));
}

/** Open lots from trade history as holdings (ltp defaults to avg cost). */
export function reconstructOpenHoldings(
  trades: PaperTrade[]
): PortfolioHolding[] {
  const sorted = [...trades].sort(
    (a, b) => tradeExecutedAtMs(a) - tradeExecutedAtMs(b)
  );
  const lots = new Map<string, { qty: number; cost: number }>();
  for (const t of sorted) {
    const key = positionKey(t.symbol, t.exchange);
    const cur = lots.get(key) ?? { qty: 0, cost: 0 };
    if (t.side === "BUY") {
      cur.qty += t.qty;
      cur.cost += t.qty * t.price + (t.charges ?? 0);
      lots.set(key, cur);
    } else {
      const sellQty = Math.min(t.qty, cur.qty);
      if (sellQty <= 0) continue;
      const avg = cur.qty > 0 ? cur.cost / cur.qty : t.price;
      cur.qty -= sellQty;
      cur.cost = Math.max(0, cur.cost - avg * sellQty);
      if (cur.qty <= 0) lots.delete(key);
      else lots.set(key, cur);
    }
  }
  const out: PortfolioHolding[] = [];
  for (const [key, lot] of lots) {
    if (lot.qty <= 0) continue;
    const [symbol, exchange] = key.split(":");
    const avgPrice = lot.qty > 0 ? lot.cost / lot.qty : 0;
    out.push({
      symbol,
      exchange: exchange || "NSE",
      qty: lot.qty,
      avgPrice,
      ltp: avgPrice,
    });
  }
  return out;
}

export function computePaperPortfolioAnalytics(
  trades: PaperTrade[],
  holdings: PortfolioHolding[],
  balance: number,
  startingBalance: number
): PaperPortfolioAnalytics {
  const equityCurve = buildPaperEquityCurve(
    trades,
    holdings,
    balance,
    startingBalance
  );
  const roundTrips = extractRoundTrips(trades);
  const pnlBreakdown = computePnlBreakdown(
    trades,
    holdings,
    balance,
    startingBalance
  );
  // Net P&L = FIFO closed-trade P&L only. Do NOT use:
  // - MTM equity curve (includes open holdings mark)
  // - cash−start+invested identity (drifts if cash/avgPrice are off and can
  //   look like realized+unrealized)
  const fifoRealized = computeFifoRealizedPnl(trades);
  const tripRealized = roundTrips.reduce((sum, r) => sum + r.pnl, 0);
  const realized =
    Math.round(
      (roundTrips.length > 0 ? tripRealized : fifoRealized) * 100
    ) / 100;
  const overallBase = computeRiskMetrics(
    equityCurve,
    roundTrips,
    startingBalance
  );
  const overall = {
    ...overallBase,
    netPnl: realized,
    endingEquity: Math.round((startingBalance + realized) * 100) / 100,
    totalReturnPct:
      startingBalance > 0
        ? Math.round((realized / startingBalance) * 10000) / 100
        : 0,
  };
  // Keep footer Realized in sync with Overall Net P&L (FIFO), not cash identity.
  const pnlBreakdownFixed = {
    ...pnlBreakdown,
    realizedPnl: realized,
  };

  const byStrategyMap = new Map<string, RoundTripPnl[]>();
  const bySymbolMap = new Map<string, RoundTripPnl[]>();
  const byMonthMap = new Map<string, RoundTripPnl[]>();

  for (const rt of roundTrips) {
    const strat = rt.strategyName?.trim() || "Unknown";
    const sym = rt.symbol.toUpperCase();
    const mo = monthKeyIST(rt.closedAtMs);

    const sList = byStrategyMap.get(strat) ?? [];
    sList.push(rt);
    byStrategyMap.set(strat, sList);

    const symList = bySymbolMap.get(sym) ?? [];
    symList.push(rt);
    bySymbolMap.set(sym, symList);

    const mList = byMonthMap.get(mo) ?? [];
    mList.push(rt);
    byMonthMap.set(mo, mList);
  }

  function toGrouped(
    map: Map<string, RoundTripPnl[]>,
    labelFn?: (key: string) => string
  ): GroupedAnalytics[] {
    return [...map.entries()]
      .map(([key, trips]) => ({
        key,
        label: labelFn ? labelFn(key) : key,
        metrics: metricsForRoundTrips(trips, startingBalance),
        roundTrips: trips.length,
      }))
      .sort((a, b) => b.metrics.netPnl - a.metrics.netPnl);
  }

  return {
    overall,
    equityCurve,
    byStrategy: toGrouped(byStrategyMap),
    bySymbol: toGrouped(bySymbolMap),
    byMonth: toGrouped(byMonthMap, formatMonthKeyLabel).sort((a, b) =>
      a.key.localeCompare(b.key)
    ),
    pnlBreakdown: pnlBreakdownFixed,
  };
}

/** Month label for trade (IST). */
export function tradeMonthKeyIST(t: PaperTrade): string {
  const ms = closedAtMs(t);
  if (ms > 0) return monthKeyIST(ms);
  const d = t.date ?? tradeDateKeyIST(t);
  return d.slice(0, 7);
}
