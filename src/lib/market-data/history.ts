import type { OHLC } from "@/types";
import { toYahooTicker } from "@/lib/market-data/yahoo";

export type ChartTimeframe =
  | "1min"
  | "5min"
  | "15min"
  | "30min"
  | "1hr"
  | "Day";

function yahooInterval(tf: ChartTimeframe): { interval: string; range: string } {
  switch (tf) {
    case "1min":
      return { interval: "1m", range: "5d" };
    case "5min":
      return { interval: "5m", range: "1mo" };
    case "15min":
      return { interval: "15m", range: "1mo" };
    case "30min":
      return { interval: "30m", range: "3mo" };
    case "1hr":
      return { interval: "1h", range: "6mo" };
    case "Day":
    default:
      return { interval: "1d", range: "2y" };
  }
}

export async function fetchYahooHistory(
  symbol: string,
  exchange: string,
  timeframe: ChartTimeframe
): Promise<OHLC[]> {
  const ticker = toYahooTicker(symbol, exchange);
  const { interval, range } = yahooInterval(timeframe);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; AlgoTrader/1.0)",
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) return [];

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  if (!quote || timestamps.length === 0) return [];

  const bars: OHLC[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    const volume = quote.volume?.[i] ?? 0;
    if (open == null || close == null) continue;
    bars.push({
      date: new Date(timestamps[i] * 1000),
      open: Number(open),
      high: Number(high ?? open),
      low: Number(low ?? open),
      close: Number(close),
      volume: Number(volume) || 0,
    });
  }
  return bars;
}
