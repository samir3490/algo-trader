export function toYahooTicker(symbol: string, exchange: string): string {
  if (symbol.startsWith("^")) return symbol;
  const suffix = exchange.toUpperCase() === "BSE" ? ".BO" : ".NS";
  return `${symbol.toUpperCase()}${suffix}`;
}

export interface MarketQuoteResult {
  symbol: string;
  exchange: string;
  lastPrice: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  source: "yahoo";
}

export async function fetchYahooQuote(
  symbol: string,
  exchange: string
): Promise<MarketQuoteResult | null> {
  const ticker = toYahooTicker(symbol, exchange);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; AlgoTrader/1.0)",
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) return null;

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta) return null;

  const lastPrice =
    Number(meta.regularMarketPrice) ||
    Number(meta.previousClose) ||
    Number(result?.indicators?.quote?.[0]?.close?.slice(-1)?.[0]) ||
    0;

  if (!lastPrice || lastPrice <= 0) return null;

  const closePrice = Number(meta.chartPreviousClose) || Number(meta.previousClose) || lastPrice;
  const open = Number(meta.regularMarketOpen) || lastPrice;
  const high = Number(meta.regularMarketDayHigh) || lastPrice;
  const low = Number(meta.regularMarketDayLow) || lastPrice;
  const volume = Number(meta.regularMarketVolume) || 0;
  const change = lastPrice - closePrice;
  const changePercent = closePrice > 0 ? (change / closePrice) * 100 : 0;

  return {
    symbol: symbol.toUpperCase(),
    exchange: exchange.toUpperCase(),
    lastPrice,
    open,
    high,
    low,
    close: closePrice,
    volume,
    change,
    changePercent,
    source: "yahoo",
  };
}
