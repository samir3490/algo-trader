import { NextRequest, NextResponse } from "next/server";
import { fetchYahooQuote } from "@/lib/market-data/yahoo";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  const exchange = request.nextUrl.searchParams.get("exchange") || "NSE";

  if (!symbol?.trim()) {
    return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
  }

  try {
    const quote = await fetchYahooQuote(symbol.trim(), exchange);
    if (!quote) {
      return NextResponse.json(
        { error: `Price not found for ${symbol} on ${exchange}` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...quote,
      buyDepth: [],
      sellDepth: [],
      lowerCircuit: 0,
      upperCircuit: 0,
      totalBuyQty: 0,
      totalSellQty: 0,
      averagePrice: quote.lastPrice,
      hasDepth: false,
      priceNote: "Live price via Yahoo Finance (delayed ~15 min for NSE/BSE)",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch market quote";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
