import { NextRequest, NextResponse } from "next/server";
import { marketDataService } from "@/lib/services/market-data-service";
import { compareToBenchmark } from "@/lib/analytics/benchmark";
import { writeSystemLog } from "@/lib/core/system-log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Compare paper return % vs Nifty 50 buy-and-hold over the same dates. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const paperReturnPct = Number(body.paperReturnPct ?? 0);
    const initialCapital = Number(body.initialCapital ?? 1_000_000);
    const startDate = body.startDate
      ? new Date(body.startDate)
      : new Date(Date.now() - 365 * 86400000);
    const endDate = body.endDate ? new Date(body.endDate) : new Date();
    const benchmarkSymbol = String(body.benchmarkSymbol ?? "^NSEI");

    const candles = await marketDataService.getHistoricalCandles({
      symbol: benchmarkSymbol,
      exchange: "NSE",
      timeframe: "Day",
      startDate,
      endDate,
    });

    if (candles.length < 10) {
      return NextResponse.json(
        { error: "Insufficient Nifty index history" },
        { status: 400 }
      );
    }

    const comparison = compareToBenchmark(
      paperReturnPct,
      candles,
      startDate,
      endDate,
      initialCapital,
      { symbol: benchmarkSymbol, label: "Nifty 50" }
    );

    if (!comparison) {
      return NextResponse.json(
        { error: "Could not compute benchmark comparison" },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, comparison });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Benchmark failed";
    writeSystemLog("ERROR", "BenchmarkAPI", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
