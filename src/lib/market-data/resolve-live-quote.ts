import { KiteConnect } from "kiteconnect";
import { fetchYahooQuote, type MarketQuoteResult } from "@/lib/market-data/yahoo";

export type LiveQuoteSource = "zerodha" | "yahoo";

export interface ResolvedLiveQuote
  extends Omit<MarketQuoteResult, "source"> {
  source: LiveQuoteSource;
  priceNote: string;
}

export interface KiteCreds {
  apiKey: string;
  accessToken: string;
}

/** Map Yahoo / regime index tickers to Zerodha quote instruments. */
export function toZerodhaQuoteSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  if (s === "^NSEI" || s === "NSEI" || s === "NIFTY" || s === "NIFTY50") {
    return "NIFTY 50";
  }
  if (s === "^NSEBANK" || s === "BANKNIFTY") return "NIFTY BANK";
  return s;
}

function findQuoteData(
  quotes: Record<string, unknown>,
  exchange: string,
  symbol: string
): Record<string, unknown> | undefined {
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
  return data ?? (Object.values(quotes)[0] as Record<string, unknown> | undefined);
}

async function fetchZerodhaQuote(
  symbol: string,
  exchange: string,
  creds: KiteCreds
): Promise<ResolvedLiveQuote | null> {
  try {
    const kite = new KiteConnect({ api_key: creds.apiKey });
    kite.setAccessToken(creds.accessToken);
    const zSymbol = toZerodhaQuoteSymbol(symbol);
    const instrument = `${exchange}:${zSymbol}`;
    const quotes = await kite.getQuote([instrument]);
    const data = findQuoteData(
      quotes as Record<string, unknown>,
      exchange,
      zSymbol
    );
    if (!data) return null;

    const lastPrice =
      Number(data.last_price) ||
      Number((data.ohlc as { close?: number })?.close) ||
      0;
    if (lastPrice <= 0) return null;

    const closePrice =
      Number((data.ohlc as { close?: number })?.close) || lastPrice;
    const change = Number(data.net_change) || lastPrice - closePrice;
    const changePercent = closePrice > 0 ? (change / closePrice) * 100 : 0;

    return {
      symbol: String(data.tradingsymbol || zSymbol).toUpperCase(),
      exchange: String(data.exchange || exchange),
      lastPrice,
      open: Number((data.ohlc as { open?: number })?.open) || 0,
      high: Number((data.ohlc as { high?: number })?.high) || 0,
      low: Number((data.ohlc as { low?: number })?.low) || 0,
      close: closePrice,
      volume: Number(data.volume) || 0,
      change,
      changePercent,
      source: "zerodha",
      priceNote: "Live price via Zerodha",
    };
  } catch {
    return null;
  }
}

/**
 * Prefer Zerodha live quotes when credentials are available;
 * fall back to Yahoo (delayed) otherwise.
 */
export async function resolveLiveQuote(
  symbol: string,
  exchange: string,
  creds?: KiteCreds | null
): Promise<ResolvedLiveQuote | null> {
  if (creds?.apiKey && creds?.accessToken) {
    const kiteQuote = await fetchZerodhaQuote(symbol, exchange, creds);
    if (kiteQuote) return kiteQuote;
  }

  const yahoo = await fetchYahooQuote(symbol, exchange);
  if (!yahoo) return null;
  return {
    ...yahoo,
    source: "yahoo",
    priceNote: "Prices via Yahoo Finance (delayed ~15 min for NSE) — Zerodha unavailable",
  };
}
