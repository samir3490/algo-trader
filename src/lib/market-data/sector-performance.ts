import { fetchYahooQuote, type MarketQuoteResult } from "@/lib/market-data/yahoo";
import { isMarketOpen } from "@/lib/utils";
import { NIFTY_SECTORS, type SectorId } from "@/lib/universe/sectors";
import { getSymbolsForSector } from "@/lib/universe/sector-map";
import { TOP100_SYMBOLS } from "@/lib/universe/symbol-lists";

export type SectorTimeframe = "1d";

export interface SectorStockDriver {
  symbol: string;
  changePercent: number;
  change: number;
  lastPrice: number;
  volume: number;
}

export interface SectorPerformanceRow {
  id: SectorId;
  name: string;
  yahooSymbol: string;
  lastPrice: number;
  changePercent: number;
  change: number;
  drivers: SectorStockDriver[];
  draggers: SectorStockDriver[];
}

export interface SectorPerformancePayload {
  timeframe: SectorTimeframe;
  sectors: SectorPerformanceRow[];
  fetchedAt: string;
  priceNote: string;
}

const CACHE_TTL_OPEN_MS = 5 * 60 * 1000;
const CACHE_TTL_CLOSED_MS = 30 * 60 * 1000;
const CONCURRENCY = 10;
const DRIVER_COUNT = 3;

let cache: { key: string; expiresAt: number; data: SectorPerformancePayload } | null =
  null;

async function mapConcurrent<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency = CONCURRENCY
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    results.push(...(await Promise.all(chunk.map(fn))));
  }
  return results;
}

function toDriver(quote: MarketQuoteResult): SectorStockDriver {
  return {
    symbol: quote.symbol,
    changePercent: quote.changePercent,
    change: quote.change,
    lastPrice: quote.lastPrice,
    volume: quote.volume,
  };
}

function rankDrivers(quotes: MarketQuoteResult[]): {
  drivers: SectorStockDriver[];
  draggers: SectorStockDriver[];
} {
  const sorted = [...quotes].sort((a, b) => b.changePercent - a.changePercent);
  const drivers = sorted
    .filter((q) => q.changePercent > 0)
    .slice(0, DRIVER_COUNT)
    .map(toDriver);
  const draggers = [...sorted]
    .filter((q) => q.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, DRIVER_COUNT)
    .map(toDriver);
  return { drivers, draggers };
}

export async function fetchSectorPerformance(
  timeframe: SectorTimeframe = "1d"
): Promise<SectorPerformancePayload> {
  const cacheKey = timeframe;
  const now = Date.now();
  const ttl = isMarketOpen() ? CACHE_TTL_OPEN_MS : CACHE_TTL_CLOSED_MS;

  if (cache && cache.key === cacheKey && cache.expiresAt > now) {
    return cache.data;
  }

  const [sectorQuotes, stockQuotes] = await Promise.all([
    mapConcurrent(NIFTY_SECTORS, async (sector) => {
      const quote = await fetchYahooQuote(sector.yahooSymbol, "NSE");
      return { sector, quote };
    }),
    mapConcurrent(TOP100_SYMBOLS, async (symbol) => {
      const quote = await fetchYahooQuote(symbol, "NSE");
      return { symbol, quote };
    }),
  ]);

  const quotesBySymbol = new Map<string, MarketQuoteResult>();
  for (const { symbol, quote } of stockQuotes) {
    if (quote) quotesBySymbol.set(symbol, quote);
  }

  const rows: SectorPerformanceRow[] = [];

  for (const { sector, quote } of sectorQuotes) {
    if (!quote) continue;

    const sectorSymbols = getSymbolsForSector(sector.id);
    const sectorStockQuotes = sectorSymbols
      .map((sym) => quotesBySymbol.get(sym))
      .filter((q): q is MarketQuoteResult => q != null);

    const { drivers, draggers } = rankDrivers(sectorStockQuotes);

    rows.push({
      id: sector.id,
      name: sector.name,
      yahooSymbol: sector.yahooSymbol,
      lastPrice: quote.lastPrice,
      changePercent: quote.changePercent,
      change: quote.change,
      drivers,
      draggers,
    });
  }

  rows.sort((a, b) => b.changePercent - a.changePercent);

  const data: SectorPerformancePayload = {
    timeframe,
    sectors: rows,
    fetchedAt: new Date().toISOString(),
    priceNote: "Prices via Yahoo Finance (delayed ~15 min for NSE)",
  };

  cache = { key: cacheKey, expiresAt: now + ttl, data };
  return data;
}

/** Test helper — clears in-memory cache */
export function clearSectorPerformanceCache(): void {
  cache = null;
}
