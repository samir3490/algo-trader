import { NextRequest, NextResponse } from "next/server";
import { marketDataService } from "@/lib/services/market-data-service";
import { runWalkForward } from "@/lib/backtest/walk-forward";
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
      : new Date(Date.now() - 3 * 365 * 86400000);
    const endDate = body.endDate ? new Date(body.endDate) : new Date();
    const trainMonths = Number(body.trainMonths ?? 12);
    const testMonths = Number(body.testMonths ?? 3);

    if (!symbol) {
      return NextResponse.json({ error: "symbol required" }, { status: 400 });
    }

    const candles = await marketDataService.getHistoricalCandles({
      symbol,
      exchange,
      timeframe: "Day",
      startDate,
      endDate,
    });

    if (candles.length < 60) {
      return NextResponse.json(
        { error: "Insufficient historical data for walk-forward" },
        { status: 400 }
      );
    }

    const result = runWalkForward(candles, {
      strategyId,
      symbol,
      exchange,
      startDate,
      endDate,
      initialCapital,
      strategyParams: body.strategyParams ?? {},
      slippagePct: Number(body.slippagePct ?? 0.05),
      trainMonths,
      testMonths,
    });

    if (result.windows.length === 0) {
      return NextResponse.json(
        { error: "Date range too short for walk-forward windows" },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Walk-forward failed";
    writeSystemLog("ERROR", "WalkForwardAPI", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
