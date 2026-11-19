import { NextRequest, NextResponse } from "next/server";
import { resolveLiveQuote } from "@/lib/market-data/resolve-live-quote";
import { getRequestKiteCreds } from "@/lib/zerodha/request-creds";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol");
  const exchange = request.nextUrl.searchParams.get("exchange") || "NSE";
  const accountId = request.nextUrl.searchParams.get("accountId");

  if (!symbol?.trim()) {
    return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
  }

  try {
    const creds = getRequestKiteCreds(request, accountId);
    const quote = await resolveLiveQuote(symbol.trim(), exchange, creds);
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
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch market quote";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
