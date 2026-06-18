import type { PaperTrade } from "@/lib/firebase";
import type { PortfolioHolding } from "@/lib/portfolio/compute-portfolio";
import {
  computePnlBreakdown,
  tradeDateKeyIST,
} from "@/lib/portfolio/compute-portfolio";
import { tradeExecutedAtMs } from "@/lib/paper-trades/normalize";
import { enrichTradesWithStrategy } from "@/lib/strategies/strategy-performance";
import {
  computeRiskMetrics,
  type EquityPoint,
  type RiskMetrics,
  type RoundTripPnl,
} from "./risk-metrics";

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

/** Extract closed round-trip P&L from paper sells (uses netPnl when present). */
export function extractRoundTrips(trades: PaperTrade[]): RoundTripPnl[] {
  const enriched = enrichTradesWithStrategy(trades);
  const trips: RoundTripPnl[] = [];
  for (const t of enriched) {
    if (t.side !== "SELL") continue;
    const ms = tradeExecutedAtMs(t);
    const pnl =
      typeof t.netPnl === "number"
        ? t.netPnl
        : 0;
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

function monthKey(ms: number): string {
  if (ms <= 0) return "unknown";
  return new Date(ms).toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  });
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
  const overall = computeRiskMetrics(equityCurve, roundTrips, startingBalance);
  const pnlBreakdown = computePnlBreakdown(
    trades,
    holdings,
    balance,
    startingBalance
  );

  const byStrategyMap = new Map<string, RoundTripPnl[]>();
  const bySymbolMap = new Map<string, RoundTripPnl[]>();
  const byMonthMap = new Map<string, RoundTripPnl[]>();

  for (const rt of roundTrips) {
    const strat = rt.strategyName?.trim() || "Unknown";
    const sym = rt.symbol.toUpperCase();
    const mo = monthKey(rt.closedAtMs);

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
    map: Map<string, RoundTripPnl[]>
  ): GroupedAnalytics[] {
    return [...map.entries()]
      .map(([key, trips]) => ({
        key,
        label: key,
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
    byMonth: toGrouped(byMonthMap).sort((a, b) => a.key.localeCompare(b.key)),
    pnlBreakdown,
  };
}

/** Month label for trade (IST). */
export function tradeMonthKeyIST(t: PaperTrade): string {
  const ms = tradeExecutedAtMs(t);
  if (ms > 0) return monthKey(ms);
  const d = t.date ?? tradeDateKeyIST(t);
  return d.slice(0, 7);
}
