/** Shared portfolio risk/return metrics for paper and backtest. */

export interface EquityPoint {
  timestamp: string;
  ms: number;
  equity: number;
}

export interface RoundTripPnl {
  symbol: string;
  exchange: string;
  pnl: number;
  closedAtMs: number;
  strategyName?: string;
}

export interface RiskMetrics {
  startingEquity: number;
  endingEquity: number;
  netPnl: number;
  totalReturnPct: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  profitFactor: number;
  winRate: number;
  closedRoundTrips: number;
  grossProfit: number;
  grossLoss: number;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((s, x) => s + (x - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(v);
}

export function computeReturnsFromEquity(curve: EquityPoint[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1].equity;
    const curr = curve[i].equity;
    if (prev > 0 && Number.isFinite(curr)) {
      returns.push((curr - prev) / prev);
    }
  }
  return returns;
}

export function computeMaxDrawdownPct(curve: EquityPoint[]): number {
  let peak = 0;
  let maxDd = 0;
  for (const p of curve) {
    if (p.equity > peak) peak = p.equity;
    if (peak > 0) {
      const dd = ((peak - p.equity) / peak) * 100;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return round2(maxDd);
}

export function computeSharpeRatio(returns: number[], annualize = 252): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const sd = stdDev(returns);
  return sd > 0 ? round2((mean / sd) * Math.sqrt(annualize)) : 0;
}

export function computeProfitFactor(roundTrips: RoundTripPnl[]): {
  profitFactor: number;
  grossProfit: number;
  grossLoss: number;
} {
  let grossProfit = 0;
  let grossLoss = 0;
  for (const rt of roundTrips) {
    if (rt.pnl > 0) grossProfit += rt.pnl;
    else if (rt.pnl < 0) grossLoss += Math.abs(rt.pnl);
  }
  const profitFactor =
    grossLoss > 0
      ? grossProfit / grossLoss
      : grossProfit > 0
        ? Number.POSITIVE_INFINITY
        : 0;
  return {
    profitFactor: Number.isFinite(profitFactor) ? round2(profitFactor) : 999,
    grossProfit: roundMoney(grossProfit),
    grossLoss: roundMoney(grossLoss),
  };
}

export function computeRiskMetrics(
  curve: EquityPoint[],
  roundTrips: RoundTripPnl[],
  startingEquity: number
): RiskMetrics {
  const endingEquity =
    curve.length > 0 ? curve[curve.length - 1].equity : startingEquity;
  // Net P&L is realized only (closed round-trips). Do not use mark-to-market
  // ending equity here — that would fold unrealized holdings P&L into "net".
  const realizedFromTrips = roundTrips.reduce((sum, r) => sum + r.pnl, 0);
  const netPnl =
    roundTrips.length > 0
      ? realizedFromTrips
      : endingEquity - startingEquity;
  const totalReturnPct =
    startingEquity > 0 ? round2((netPnl / startingEquity) * 100) : 0;
  const returns = computeReturnsFromEquity(curve);
  const { profitFactor, grossProfit, grossLoss } = computeProfitFactor(roundTrips);
  const wins = roundTrips.filter((r) => r.pnl > 0).length;
  const closedRoundTrips = roundTrips.length;
  const winRate =
    closedRoundTrips > 0 ? round2((wins / closedRoundTrips) * 100) : 0;

  return {
    startingEquity: roundMoney(startingEquity),
    endingEquity: roundMoney(endingEquity),
    netPnl: roundMoney(netPnl),
    totalReturnPct,
    sharpeRatio: computeSharpeRatio(returns),
    maxDrawdownPct: computeMaxDrawdownPct(curve),
    profitFactor,
    winRate,
    closedRoundTrips,
    grossProfit,
    grossLoss,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}
