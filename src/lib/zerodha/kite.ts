import { KiteConnect } from "kiteconnect";
import type { KiteProfile, KitePosition, MarketQuote, OHLC } from "@/types";

type KiteInstance = InstanceType<typeof KiteConnect>;
let kiteInstance: KiteInstance | null = null;

export function getKiteClient(accessToken?: string): KiteInstance {
  if (!process.env.KITE_API_KEY) {
    throw new Error("KITE_API_KEY is not configured");
  }

  if (!kiteInstance) {
    kiteInstance = new KiteConnect({ api_key: process.env.KITE_API_KEY });
  }

  if (accessToken) {
    kiteInstance.setAccessToken(accessToken);
  }

  return kiteInstance;
}

export function getLoginURL(): string {
  const kite = getKiteClient();
  return kite.getLoginURL();
}

export async function generateSession(requestToken: string): Promise<{
  accessToken: string;
  userId: string;
}> {
  const kite = getKiteClient();
  const session = await kite.generateSession(
    requestToken,
    process.env.KITE_API_SECRET!
  );
  return {
    accessToken: session.access_token,
    userId: session.user_id,
  };
}

export async function getProfile(accessToken: string): Promise<KiteProfile> {
  const kite = getKiteClient(accessToken);
  const profile = await kite.getProfile();
  return {
    userId: profile.user_id,
    userName: profile.user_name,
    email: profile.email,
    broker: profile.broker,
    exchanges: profile.exchanges,
  };
}

export async function getQuote(
  accessToken: string,
  instruments: string[]
): Promise<Record<string, MarketQuote>> {
  const kite = getKiteClient(accessToken);
  const quotes = await kite.getQuote(instruments);
  const result: Record<string, MarketQuote> = {};

  for (const [key, quote] of Object.entries(quotes) as [string, any][]) {
    result[key] = {
      symbol: quote.tradingsymbol || key.split(":")[1],
      exchange: quote.exchange || key.split(":")[0],
      lastPrice: quote.last_price,
      open: quote.ohlc?.open || 0,
      high: quote.ohlc?.high || 0,
      low: quote.ohlc?.low || 0,
      close: quote.ohlc?.close || 0,
      volume: quote.volume || 0,
      change: quote.net_change || 0,
      changePercent: quote.ohlc?.close
        ? ((quote.last_price - quote.ohlc.close) / quote.ohlc.close) * 100
        : 0,
      timestamp: new Date(quote.timestamp || Date.now()),
    };
  }

  return result;
}

export async function getHistoricalData(
  accessToken: string,
  instrumentToken: number,
  interval: "minute" | "3minute" | "5minute" | "10minute" | "15minute" | "30minute" | "60minute" | "day",
  from: Date,
  to: Date
): Promise<OHLC[]> {
  const kite = getKiteClient(accessToken);
  const data = await kite.getHistoricalData(
    instrumentToken,
    interval,
    from,
    to
  );

  return data.map((candle: any) => ({
    date: new Date(candle.date),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  }));
}

export async function placeOrder(
  accessToken: string,
  params: {
    tradingsymbol: string;
    exchange: string;
    transaction_type: "BUY" | "SELL";
    order_type: "MARKET" | "LIMIT" | "SL" | "SL-M";
    quantity: number;
    price?: number;
    trigger_price?: number;
    product: "MIS" | "CNC" | "NRML";
    validity?: "DAY" | "IOC";
  }
): Promise<{ orderId: string }> {
  const kite = getKiteClient(accessToken);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await kite.placeOrder("regular", params as any);
  return { orderId: result.order_id };
}

export async function getOrders(accessToken: string) {
  const kite = getKiteClient(accessToken);
  return kite.getOrders();
}

export async function getPositions(
  accessToken: string
): Promise<{ net: KitePosition[]; day: KitePosition[] }> {
  const kite = getKiteClient(accessToken);
  const positions = await kite.getPositions();

  const mapPosition = (p: any): KitePosition => ({
    tradingsymbol: p.tradingsymbol,
    exchange: p.exchange,
    quantity: p.quantity,
    averagePrice: p.average_price,
    lastPrice: p.last_price,
    pnl: p.pnl,
    value: p.value,
  });

  return {
    net: positions.net?.map(mapPosition) || [],
    day: positions.day?.map(mapPosition) || [],
  };
}

export async function cancelOrder(
  accessToken: string,
  orderId: string
): Promise<void> {
  const kite = getKiteClient(accessToken);
  await kite.cancelOrder("regular", orderId);
}

export async function getHoldings(accessToken: string) {
  const kite = getKiteClient(accessToken);
  return kite.getHoldings();
}

export async function getMargins(accessToken: string) {
  const kite = getKiteClient(accessToken);
  return kite.getMargins();
}
