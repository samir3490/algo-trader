import type { OHLC } from "@/types";

export interface BenchmarkPoint {
  date: string;
  ms: number;
  indexValue: number;
  normalizedEquity: number;
}

export interface BenchmarkComparison {
  symbol: string;
  label: string;
  startDate: string;
  endDate: string;
  paperReturnPct: number;
  benchmarkReturnPct: number;
  alphaPct: number;
  paperCurve: { date: string; value: number }[];
  benchmarkCurve: { date: string; value: number }[];
}

/** Buy-and-hold return from first to last close in range. */
export function computeBuyAndHoldReturn(
  candles: OHLC[],
  start: Date,
  end: Date
): { returnPct: number; startPrice: number; endPrice: number } | null {
  const filtered = candles
    .filter((c) => c.date >= start && c.date <= end && c.close > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  if (filtered.length < 2) return null;
  const startPrice = filtered[0].close;
  const endPrice = filtered[filtered.length - 1].close;
  if (startPrice <= 0) return null;
  return {
    returnPct: ((endPrice - startPrice) / startPrice) * 100,
    startPrice,
    endPrice,
  };
}

export function buildBenchmarkCurve(
  candles: OHLC[],
  start: Date,
  end: Date,
  initialCapital: number
): BenchmarkPoint[] {
  const filtered = candles
    .filter((c) => c.date >= start && c.date <= end && c.close > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  if (filtered.length === 0) return [];
  const base = filtered[0].close;
  return filtered.map((c) => ({
    date: c.date.toISOString().slice(0, 10),
    ms: c.date.getTime(),
    indexValue: c.close,
    normalizedEquity: base > 0 ? (c.close / base) * initialCapital : initialCapital,
  }));
}

export function compareToBenchmark(
  paperReturnPct: number,
  candles: OHLC[],
  start: Date,
  end: Date,
  initialCapital: number,
  options?: { symbol?: string; label?: string }
): BenchmarkComparison | null {
  const bh = computeBuyAndHoldReturn(candles, start, end);
  if (!bh) return null;
  const benchCurve = buildBenchmarkCurve(candles, start, end, initialCapital);

  const benchmarkReturnPct = Math.round(bh.returnPct * 100) / 100;
  return {
    symbol: options?.symbol ?? "^NSEI",
    label: options?.label ?? "Nifty 50",
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    paperReturnPct: Math.round(paperReturnPct * 100) / 100,
    benchmarkReturnPct,
    alphaPct: Math.round((paperReturnPct - benchmarkReturnPct) * 100) / 100,
    paperCurve: benchCurve.map((p, i, arr) => ({
      date: p.date,
      value: Math.round(
        initialCapital *
          (1 + (paperReturnPct / 100) * (i / Math.max(1, arr.length - 1)))
      ),
    })),
    benchmarkCurve: benchCurve.map((p) => ({
      date: p.date,
      value: Math.round(p.normalizedEquity),
    })),
  };
}

/** True when in-sample dramatically beats out-of-sample (overfitting risk). */
export function detectOverfit(
  inSampleReturnPct: number,
  outOfSampleReturnPct: number,
  thresholdGap = 15
): boolean {
  return (
    inSampleReturnPct > 5 &&
    inSampleReturnPct - outOfSampleReturnPct > thresholdGap
  );
}
