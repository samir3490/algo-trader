import type { OHLC } from "@/types";
import { runBacktest, type BacktestParams, type BacktestResult } from "@/lib/backtest/engine";
import { detectOverfit } from "@/lib/analytics/benchmark";

export interface WalkForwardParams {
  strategyId: string;
  symbol: string;
  exchange?: string;
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  strategyParams?: Record<string, number>;
  slippagePct?: number;
  product?: "CNC" | "MIS";
  trainMonths?: number;
  testMonths?: number;
}

export interface WalkForwardWindow {
  trainStart: string;
  trainEnd: string;
  testStart: string;
  testEnd: string;
  inSample: BacktestResult;
  outOfSample: BacktestResult;
  overfitWarning: boolean;
}

export interface WalkForwardResult {
  windows: WalkForwardWindow[];
  avgInSampleReturnPct: number;
  avgOutOfSampleReturnPct: number;
  overfitWindows: number;
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

export function runWalkForward(
  candles: OHLC[],
  params: WalkForwardParams
): WalkForwardResult {
  const trainMonths = params.trainMonths ?? 12;
  const testMonths = params.testMonths ?? 3;
  const windows: WalkForwardWindow[] = [];

  let cursor = new Date(params.startDate);
  const end = new Date(params.endDate);

  while (cursor < end) {
    const trainStart = new Date(cursor);
    const trainEnd = addMonths(trainStart, trainMonths);
    const testStart = new Date(trainEnd);
    testStart.setDate(testStart.getDate() + 1);
    const testEnd = addMonths(testStart, testMonths);

    if (testEnd > end) break;

    const base: Omit<BacktestParams, "startDate" | "endDate"> = {
      strategyId: params.strategyId,
      symbol: params.symbol,
      exchange: params.exchange,
      initialCapital: params.initialCapital,
      strategyParams: params.strategyParams,
      slippagePct: params.slippagePct,
      product: params.product,
    };

    const inSample = runBacktest(candles, {
      ...base,
      startDate: trainStart,
      endDate: trainEnd,
    });
    const outOfSample = runBacktest(candles, {
      ...base,
      startDate: testStart,
      endDate: testEnd,
    });

    windows.push({
      trainStart: trainStart.toISOString(),
      trainEnd: trainEnd.toISOString(),
      testStart: testStart.toISOString(),
      testEnd: testEnd.toISOString(),
      inSample,
      outOfSample,
      overfitWarning: detectOverfit(
        inSample.totalReturnPct,
        outOfSample.totalReturnPct
      ),
    });

    cursor = addMonths(cursor, testMonths);
  }

  const avgInSampleReturnPct =
    windows.length > 0
      ? windows.reduce((s, w) => s + w.inSample.totalReturnPct, 0) / windows.length
      : 0;
  const avgOutOfSampleReturnPct =
    windows.length > 0
      ? windows.reduce((s, w) => s + w.outOfSample.totalReturnPct, 0) / windows.length
      : 0;

  return {
    windows,
    avgInSampleReturnPct: Math.round(avgInSampleReturnPct * 100) / 100,
    avgOutOfSampleReturnPct: Math.round(avgOutOfSampleReturnPct * 100) / 100,
    overfitWindows: windows.filter((w) => w.overfitWarning).length,
  };
}
