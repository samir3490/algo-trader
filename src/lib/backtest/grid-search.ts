import type { OHLC } from "@/types";
import { runBacktest, type BacktestResult } from "@/lib/backtest/engine";
import { detectOverfit } from "@/lib/analytics/benchmark";
import { STRATEGY_DEFINITIONS } from "@/lib/strategies/definitions";

export interface GridParamRange {
  key: string;
  values: number[];
}

export interface GridSearchParams {
  strategyId: string;
  symbol: string;
  exchange?: string;
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  paramRanges: GridParamRange[];
  slippagePct?: number;
  product?: "CNC" | "MIS";
  rankBy?: "totalReturnPct" | "sharpeRatio" | "profitFactor";
  maxResults?: number;
}

export interface GridSearchRow {
  params: Record<string, number>;
  result: BacktestResult;
  rank: number;
}

export interface GridSearchResult {
  rows: GridSearchRow[];
  combinationsTested: number;
  overfitWarning: string | null;
  best: GridSearchRow | null;
}

export function defaultGridRanges(strategyId: string): GridParamRange[] {
  const key = strategyId.toLowerCase();
  if (key === "rsi" || key === "mean_reversion") {
    return [
      { key: "period", values: [10, 14, 21] },
      { key: "oversold", values: [25, 30, 35] },
      { key: "overbought", values: [65, 70, 75] },
    ];
  }
  const def = STRATEGY_DEFINITIONS.find((d) => d.id === strategyId);
  if (!def) return [];
  return [
    { key: "shortPeriod", values: [5, 9, 12] },
    { key: "longPeriod", values: [15, 21, 30, 50] },
  ];
}

function cartesianProduct(ranges: GridParamRange[]): Record<string, number>[] {
  if (ranges.length === 0) return [{}];
  const [first, ...rest] = ranges;
  const restProduct = cartesianProduct(rest);
  const out: Record<string, number>[] = [];
  for (const v of first.values) {
    for (const combo of restProduct) {
      out.push({ [first.key]: v, ...combo });
    }
  }
  return out;
}

export function runGridSearch(
  candles: OHLC[],
  params: GridSearchParams
): GridSearchResult {
  const combos = cartesianProduct(params.paramRanges);
  const rankBy = params.rankBy ?? "sharpeRatio";
  const maxResults = params.maxResults ?? 10;

  const rows: GridSearchRow[] = combos.map((strategyParams) => ({
    params: strategyParams,
    result: runBacktest(candles, {
      strategyId: params.strategyId,
      symbol: params.symbol,
      exchange: params.exchange,
      startDate: params.startDate,
      endDate: params.endDate,
      initialCapital: params.initialCapital,
      strategyParams,
      slippagePct: params.slippagePct,
      product: params.product,
    }),
    rank: 0,
  }));

  rows.sort((a, b) => {
    const av = a.result[rankBy] as number;
    const bv = b.result[rankBy] as number;
    return bv - av;
  });
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  const top = rows.slice(0, maxResults);
  const best = top[0] ?? null;
  const worst = rows[rows.length - 1];

  let overfitWarning: string | null = null;
  if (
    best &&
    worst &&
    rows.length >= 6 &&
    detectOverfit(best.result.totalReturnPct, worst.result.totalReturnPct, 25)
  ) {
    overfitWarning =
      "Top parameter set may be overfit — large spread across grid. Validate with walk-forward before trusting results.";
  } else if (rows.length >= 20) {
    overfitWarning =
      "Many combinations tested — use walk-forward validation to reduce overfitting risk.";
  }

  return {
    rows: top,
    combinationsTested: combos.length,
    overfitWarning,
    best,
  };
}
