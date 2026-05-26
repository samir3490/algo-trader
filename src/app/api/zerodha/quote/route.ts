import { NextRequest, NextResponse } from "next/server";
import { KiteConnect } from "kiteconnect";
import { getAccountToken } from "@/lib/zerodha/account-token";

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("accountId");
  const accessToken = getAccountToken(request, accountId);
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const symbol = request.nextUrl.searchParams.get("symbol");
  const exchange = request.nextUrl.searchParams.get("exchange") || "NSE";

  if (!symbol) {
    return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
  }

  try {
    const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY! });
    kite.setAccessToken(accessToken);

    const instrument = `${exchange}:${symbol.toUpperCase()}`;
    const quote = await kite.getQuote([instrument]);
    const data = quote[instrument] as any;

    if (!data) {
      return NextResponse.json({ error: "Symbol not found" }, { status: 404 });
    }

    return NextResponse.json({
      symbol: data.tradingsymbol || symbol.toUpperCase(),
      exchange: exchange,
      lastPrice: data.last_price,
      open: data.ohlc?.open,
      high: data.ohlc?.high,
      low: data.ohlc?.low,
      close: data.ohlc?.close,
      volume: data.volume,
      change: data.net_change,
      changePercent: data.ohlc?.close
        ? ((data.last_price - data.ohlc.close) / data.ohlc.close) * 100
        : 0,
      buyDepth: data.depth?.buy?.slice(0, 5).map((b: any) => ({
        price: b.price,
        quantity: b.quantity,
        orders: b.orders,
      })) || [],
      sellDepth: data.depth?.sell?.slice(0, 5).map((s: any) => ({
        price: s.price,
        quantity: s.quantity,
        orders: s.orders,
      })) || [],
      lowerCircuit: data.lower_circuit_limit,
      upperCircuit: data.upper_circuit_limit,
      totalBuyQty: data.buy_quantity,
      totalSellQty: data.sell_quantity,
      averagePrice: data.average_price,
      lastTradeTime: data.last_trade_time,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
