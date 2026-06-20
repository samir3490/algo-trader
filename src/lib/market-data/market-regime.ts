import { DEFAULT_SETTINGS } from "@/lib/firebase";
import { fetchYahooHistory } from "@/lib/market-data/history";
import { fetchYahooQuote } from "@/lib/market-data/yahoo";
import { computeRegimeSnapshot, type RegimeSnapshot } from "@/lib/strategies/regime";
import { isMarketOpen } from "@/lib/utils";

export interface MarketRegimePayload {
  indexSymbol: string;
  indexName: string;
  lastPrice: number;
  change: number;
  changePercent: number;
  regime: RegimeSnapshot | null;
  sparkline: { date: string; close: number }[];
  fetchedAt: string;
  priceNote: string;
}

const CACHE_TTL_OPEN_MS = 5 * 60 * 1000;
const CACHE_TTL_CLOSED_MS = 30 * 60 * 1000;

let cache: { expiresAt: number; data: MarketRegimePayload } | null = null;

export async function fetchMarketRegime(): Promise<MarketRegimePayload> {
  const now = Date.now();
  const ttl = isMarketOpen() ? CACHE_TTL_OPEN_MS : CACHE_TTL_CLOSED_MS;

  if (cache && cache.expiresAt > now) {
    return cache.data;
  }

  const indexSymbol = DEFAULT_SETTINGS.regimeIndexSymbol ?? "^NSEI";
  const [quote, bars] = await Promise.all([
    fetchYahooQuote(indexSymbol, "NSE"),
    fetchYahooHistory(indexSymbol, "NSE", "Day"),
  ]);

  const regime = computeRegimeSnapshot(bars, {
    regimeIndexSymbol: DEFAULT_SETTINGS.regimeIndexSymbol,
    regimeAdxPeriod: DEFAULT_SETTINGS.regimeAdxPeriod,
    regimeAdxThreshold: DEFAULT_SETTINGS.regimeAdxThreshold,
    regimeAdxSlopeWindow: DEFAULT_SETTINGS.regimeAdxSlopeWindow,
  });

  const sparkline = bars.slice(-10).map((b) => ({
    date:
      b.date instanceof Date
        ? b.date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
        : String(b.date),
    close: b.close,
  }));

  const data: MarketRegimePayload = {
    indexSymbol,
    indexName: "Nifty 50",
    lastPrice: quote?.lastPrice ?? 0,
    change: quote?.change ?? 0,
    changePercent: quote?.changePercent ?? 0,
    regime,
    sparkline,
    fetchedAt: new Date().toISOString(),
    priceNote: "Prices via Yahoo Finance (delayed ~15 min for NSE)",
  };

  cache = { expiresAt: now + ttl, data };
  return data;
}

export function clearMarketRegimeCache(): void {
  cache = null;
}
