import { NextRequest, NextResponse } from "next/server";
import { KiteConnect } from "kiteconnect";
import { getAccountToken, getAccountApiKey } from "@/lib/zerodha/account-token";

function findQuoteData(quotes: Record<string, unknown>, exchange: string, symbol: string) {
  const instrument = `${exchange}:${symbol.toUpperCase()}`;
  let data = quotes[instrument] as Record<string, unknown> | undefined;

  if (!data) {
    data = Object.values(quotes).find((q) => {
      const item = q as Record<string, unknown>;
      return (
        String(item.tradingsymbol || "").toUpperCase() === symbol.toUpperCase() &&
        String(item.exchange || exchange).toUpperCase() === exchange.toUpperCase()
      );
    }) as Record<string, unknown> | undefined;
  }

  if (!data) {
    data = Object.values(quotes)[0] as Record<string, unknown> | undefined;
  }

  return data;
}

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("accountId");
  const accessToken = getAccountToken(request, accountId);
  const apiKey = getAccountApiKey(request, accountId);
  if (!accessToken || !apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const symbol = request.nextUrl.searchParams.get("symbol");
  const exchange = request.nextUrl.searchParams.get("exchange") || "NSE";

  if (!symbol) {
    return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
  }

  try {
    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);

    const instrument = `${exchange}:${symbol.toUpperCase()}`;
    const quotes = await kite.getQuote([instrument]);
    const data = findQuoteData(quotes as Record<string, unknown>, exchange, symbol);

    if (!data) {
      return NextResponse.json({ error: "Symbol not found" }, { status: 404 });
    }

    const lastPrice =
      Number(data.last_price) ||
      Number((data.ohlc as { close?: number })?.close) ||
      Number(data.close_price) ||
      0;

    const closePrice = Number((data.ohlc as { close?: number })?.close) || lastPrice;
    const change = Number(data.net_change) || lastPrice - closePrice;
    const changePercent = closePrice > 0 ? (change / closePrice) * 100 : 0;

    return NextResponse.json({
      symbol: String(data.tradingsymbol || symbol).toUpperCase(),
      exchange: String(data.exchange || exchange),
      lastPrice,
      open: Number((data.ohlc as { open?: number })?.open) || 0,
      high: Number((data.ohlc as { high?: number })?.high) || 0,
      low: Number((data.ohlc as { low?: number })?.low) || 0,
      close: closePrice,
      volume: Number(data.volume) || 0,
      change,
      changePercent,
      buyDepth: ((data.depth as { buy?: unknown[] })?.buy || [])
        .slice(0, 5)
        .map((b: unknown) => {
          const row = b as { price?: number; quantity?: number; orders?: number };
          return { price: row.price, quantity: row.quantity, orders: row.orders };
        }),
      sellDepth: ((data.depth as { sell?: unknown[] })?.sell || [])
        .slice(0, 5)
        .map((s: unknown) => {
          const row = s as { price?: number; quantity?: number; orders?: number };
          return { price: row.price, quantity: row.quantity, orders: row.orders };
        }),
      lowerCircuit: Number(data.lower_circuit_limit) || 0,
      upperCircuit: Number(data.upper_circuit_limit) || 0,
      totalBuyQty: Number(data.buy_quantity) || 0,
      totalSellQty: Number(data.sell_quantity) || 0,
      averagePrice: Number(data.average_price) || 0,
      lastTradeTime: data.last_trade_time,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Quote fetch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
