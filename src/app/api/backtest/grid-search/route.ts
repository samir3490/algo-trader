import { NextRequest, NextResponse } from "next/server";
import { marketDataService } from "@/lib/services/market-data-service";
import {
  defaultGridRanges,
  runGridSearch,
  type GridParamRange,
} from "@/lib/backtest/grid-search";
import { writeSystemLog } from "@/lib/core/system-log";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const symbol = String(body.symbol ?? "").trim().toUpperCase();
    const strategyId = String(body.strategyId ?? "sma");
    const exchange = String(body.exchange ?? "NSE");
    const initialCapital = Number(body.initialCapital ?? 1_000_000);
    const startDate = body.startDate
      ? new Date(body.startDate)
      : new Date(Date.now() - 365 * 86400000);
    const endDate = body.endDate ? new Date(body.endDate) : new Date();

    if (!symbol) {
      return NextResponse.json({ error: "symbol required" }, { status: 400 });
    }

    const paramRanges: GridParamRange[] =
      body.paramRanges?.length > 0
        ? body.paramRanges
        : defaultGridRanges(strategyId);

    const candles = await marketDataService.getHistoricalCandles({
      symbol,
      exchange,
      timeframe: "Day",
      startDate,
      endDate,
    });

    if (candles.length < 40) {
      return NextResponse.json(
        { error: "Insufficient historical data for grid search" },
        { status: 400 }
      );
    }

    const result = runGridSearch(candles, {
      strategyId,
      symbol,
      exchange,
      startDate,
      endDate,
      initialCapital,
      paramRanges,
      slippagePct: Number(body.slippagePct ?? 0.05),
      rankBy: body.rankBy ?? "sharpeRatio",
      maxResults: Number(body.maxResults ?? 10),
    });

    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Grid search failed";
    writeSystemLog("ERROR", "GridSearchAPI", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
