import { NextRequest, NextResponse } from "next/server";
import { fetchYahooHistory, type ChartTimeframe } from "@/lib/market-data/history";

const VALID_TIMEFRAMES: ChartTimeframe[] = [
  "1min",
  "5min",
  "15min",
  "30min",
  "1hr",
  "Day",
];

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  const exchange = request.nextUrl.searchParams.get("exchange") || "NSE";
  const timeframe = (request.nextUrl.searchParams.get("timeframe") || "Day") as ChartTimeframe;

  if (!symbol?.trim()) {
    return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
  }

  if (!VALID_TIMEFRAMES.includes(timeframe)) {
    return NextResponse.json({ error: "Invalid timeframe" }, { status: 400 });
  }

  try {
    const bars = await fetchYahooHistory(symbol.trim(), exchange, timeframe);
    if (bars.length === 0) {
      return NextResponse.json(
        { error: `No price history for ${symbol}` },
        { status: 404 }
      );
    }
    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      exchange: exchange.toUpperCase(),
      timeframe,
      bars: bars.map((b) => ({
        ...b,
        date: b.date.toISOString(),
      })),
      count: bars.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
