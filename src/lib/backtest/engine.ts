import type { OHLC } from "@/types";
import { applyBacktestFriction } from "@/lib/backtest/charges";
import { movingAverageCrossover } from "@/lib/strategies/engines/moving-average-crossover";
import { rsiMeanReversion } from "@/lib/strategies/engines/rsi-mean-reversion";
import type { StructuredSignal } from "@/lib/trading/structured-signal";
import { BaseStrategy } from "@/lib/strategies/base-strategy";

export interface BacktestParams {
  strategyId: string;
  symbol: string;
  exchange?: string;
  timeframe?: string;
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  strategyParams?: Record<string, number>;
  slippagePct?: number;
  product?: "CNC" | "MIS";
}

export interface BacktestTrade {
  side: "BUY" | "SELL";
  price: number;
  qty: number;
  timestamp: string;
  charges: number;
  reason: string;
}

export interface BacktestResult {
  strategyId: string;
  symbol: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  finalCapital: number;
  /** finalCapital − initialCapital (charges included). */
  netPnL: number;
  totalReturnPct: number;
  winRate: number;
  profitFactor: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  totalTrades: number;
  closedRoundTrips: number;
  trades: BacktestTrade[];
  equityCurve: { timestamp: string; equity: number }[];
}

function pickStrategy(id: string): BaseStrategy | null {
  const key = id.toLowerCase();
  if (key.includes("rsi") || key === "mean_reversion") return rsiMeanReversion;
  if (key.includes("sma") || key.includes("ma") || key.includes("crossover")) {
    return movingAverageCrossover;
  }
  return movingAverageCrossover;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((s, x) => s + (x - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(v);
}

/**
 * Candle-by-candle backtest — no look-ahead (only data <= index i).
 */
export function runBacktest(candles: OHLC[], params: BacktestParams): BacktestResult {
  const strategy = pickStrategy(params.strategyId);
  const symbol = params.symbol.toUpperCase();
  const filtered = candles
    .filter((c) => c.date >= params.startDate && c.date <= params.endDate)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  let cash = params.initialCapital;
  let position = 0;
  let avgCost = 0;
  /** Cash spent on open position (negative), includes buy charges. */
  let entryCashDelta = 0;
  const trades: BacktestTrade[] = [];
  const equityCurve: { timestamp: string; equity: number }[] = [];
  const tradePnls: number[] = [];
  let wins = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let peak = params.initialCapital;
  let maxDrawdown = 0;
  const dailyReturns: number[] = [];
  let lastEquity = params.initialCapital;

  const minBars = 30;
  for (let i = minBars; i < filtered.length; i++) {
    const window = filtered.slice(0, i + 1);
    const bar = filtered[i];

    let sig: StructuredSignal | null = null;
    if (strategy) {
      sig = strategy.evaluate(symbol, window, params.strategyParams ?? {});
    }

    const qty = params.strategyParams?.quantity ?? 1;

    if (sig?.signalType === "BUY" && position === 0 && cash > bar.close * qty) {
      const fr = applyBacktestFriction({
        side: "BUY",
        qty,
        price: bar.close,
        slippagePct: params.slippagePct,
        product: params.product,
      });
      if (cash + fr.cashDelta >= 0) {
        cash += fr.cashDelta;
        position = qty;
        avgCost = fr.fillPrice;
        entryCashDelta = fr.cashDelta;
        trades.push({
          side: "BUY",
          price: fr.fillPrice,
          qty,
          timestamp: bar.date.toISOString(),
          charges: fr.charges,
          reason: sig.reason,
        });
      }
    } else if (
      (sig?.signalType === "SELL" || sig?.signalType === "EXIT") &&
      position > 0
    ) {
      const fr = applyBacktestFriction({
        side: "SELL",
        qty: position,
        price: bar.close,
        slippagePct: params.slippagePct,
        product: params.product,
      });
      cash += fr.cashDelta;
      const pnl = fr.cashDelta + entryCashDelta;
      tradePnls.push(pnl);
      if (pnl >= 0) {
        wins += 1;
        grossProfit += pnl;
      } else {
        grossLoss += Math.abs(pnl);
      }
      trades.push({
        side: "SELL",
        price: fr.fillPrice,
        qty: position,
        timestamp: bar.date.toISOString(),
        charges: fr.charges,
        reason: sig?.reason ?? "Exit",
      });
      position = 0;
      avgCost = 0;
      entryCashDelta = 0;
    }

    const equity = cash + position * bar.close;
    equityCurve.push({ timestamp: bar.date.toISOString(), equity });
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;

    const ret = (equity - lastEquity) / lastEquity;
    if (Number.isFinite(ret)) dailyReturns.push(ret);
    lastEquity = equity;
  }

  const lastBar = filtered[filtered.length - 1];
  if (position > 0 && lastBar) {
    const fr = applyBacktestFriction({
      side: "SELL",
      qty: position,
      price: lastBar.close,
      slippagePct: params.slippagePct,
      product: params.product,
    });
    cash += fr.cashDelta;
    const pnl = fr.cashDelta + entryCashDelta;
    tradePnls.push(pnl);
    if (pnl >= 0) {
      wins += 1;
      grossProfit += pnl;
    } else {
      grossLoss += Math.abs(pnl);
    }
    trades.push({
      side: "SELL",
      price: fr.fillPrice,
      qty: position,
      timestamp: lastBar.date.toISOString(),
      charges: fr.charges,
      reason: "End-of-period exit",
    });
    position = 0;
    entryCashDelta = 0;
  }

  const finalCapital = cash;
  const closedRoundTrips = tradePnls.length;
  const winRate =
    closedRoundTrips > 0 ? (wins / closedRoundTrips) * 100 : 0;
  const profitFactor =
    grossLoss > 0
      ? grossProfit / grossLoss
      : grossProfit > 0
        ? Number.POSITIVE_INFINITY
        : 0;
  const meanRet = dailyReturns.length
    ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
    : 0;
  const sd = stdDev(dailyReturns);
  const sharpeRatio = sd > 0 ? (meanRet / sd) * Math.sqrt(252) : 0;

  const netPnL = finalCapital - params.initialCapital;

  return {
    strategyId: params.strategyId,
    symbol,
    startDate: params.startDate.toISOString(),
    endDate: params.endDate.toISOString(),
    initialCapital: params.initialCapital,
    finalCapital: round2(finalCapital),
    netPnL: round2(netPnL),
    totalReturnPct: round2((netPnL / params.initialCapital) * 100),
    winRate: round2(winRate),
    profitFactor: Number.isFinite(profitFactor) ? round2(profitFactor) : 999,
    maxDrawdownPct: round2(maxDrawdown),
    sharpeRatio: round2(sharpeRatio),
    totalTrades: trades.length,
    closedRoundTrips,
    trades,
    equityCurve,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
