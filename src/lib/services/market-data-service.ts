import type { OHLC } from "@/types";
import type { ChartTimeframe } from "@/lib/market-data/history";
import { fetchYahooHistory } from "@/lib/market-data/history";
import { isPrismaEnabled } from "@/lib/core/config";
import { writeSystemLog } from "@/lib/core/system-log";
import { getPrisma } from "@/lib/db";

const memoryCache = new Map<string, OHLC[]>();

function cacheKey(symbol: string, exchange: string, timeframe: ChartTimeframe): string {
  return `${symbol.toUpperCase()}:${exchange}:${timeframe}`;
}

function forwardFillGaps(bars: OHLC[]): OHLC[] {
  if (bars.length === 0) return bars;
  const out: OHLC[] = [];
  let last = bars[0];
  for (const b of bars) {
    if (b.close > 0 && b.open > 0) {
      out.push(b);
      last = b;
    } else {
      out.push({ ...last, date: b.date, volume: 0 });
      writeSystemLog("WARN", "MarketDataService", "Forward-filled gap", {
        symbol: "unknown",
        at: b.date.toISOString(),
      });
    }
  }
  return out;
}

/** Chunk long ranges into ~90-day Yahoo windows. */
function chunkDateRanges(
  start: Date,
  end: Date,
  chunkDays = 90
): { from: Date; to: Date }[] {
  const chunks: { from: Date; to: Date }[] = [];
  let cur = new Date(start);
  while (cur < end) {
    const to = new Date(cur);
    to.setDate(to.getDate() + chunkDays);
    chunks.push({ from: new Date(cur), to: to > end ? end : to });
    cur = new Date(to);
    cur.setDate(cur.getDate() + 1);
  }
  return chunks;
}

async function loadCandlesFromDb(
  symbol: string,
  exchange: string,
  timeframe: string,
  start: Date,
  end: Date
): Promise<OHLC[] | null> {
  const prisma = getPrisma();
  if (!prisma) return null;
  try {
    const rows = await prisma.candle.findMany({
      where: {
        symbol: symbol.toUpperCase(),
        exchange: exchange.toUpperCase(),
        timeframe,
        timestamp: { gte: start, lte: end },
      },
      orderBy: { timestamp: "asc" },
    });
    if (rows.length === 0) return null;
    return rows.map((r) => ({
      date: r.timestamp,
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      volume: Number(r.volume),
    }));
  } catch (e) {
    writeSystemLog("WARN", "MarketDataService", "Postgres candle read failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

async function persistCandlesAsync(
  symbol: string,
  exchange: string,
  timeframe: string,
  bars: OHLC[],
  source: string
): Promise<void> {
  const prisma = getPrisma();
  if (!prisma || bars.length === 0) return;
  try {
    const slice = bars.slice(-500);
    await prisma.candle.createMany({
      data: slice.map((b) => ({
        symbol: symbol.toUpperCase(),
        exchange: exchange.toUpperCase(),
        timeframe,
        timestamp: b.date,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
        source,
      })),
      skipDuplicates: true,
    });
  } catch (e) {
    writeSystemLog("ERROR", "MarketDataService", "Failed to persist candles", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/** NSE Bhavcopy / paid vendor — stubs for future integration. */
export async function fetchFromBhavcopyStub(
  _symbol: string,
  _start: Date,
  _end: Date
): Promise<OHLC[] | null> {
  writeSystemLog("INFO", "MarketDataService", "Bhavcopy parser not implemented");
  return null;
}

export async function fetchFromPaidVendorStub(
  _symbol: string,
  _start: Date,
  _end: Date
): Promise<OHLC[] | null> {
  writeSystemLog("INFO", "MarketDataService", "Paid vendor API not configured");
  return null;
}

export class MarketDataService {
  /**
   * 1. Memory cache → 2. Postgres → 3. Yahoo (persist async).
   */
  async getHistoricalCandles(params: {
    symbol: string;
    exchange?: string;
    timeframe?: ChartTimeframe;
    startDate?: Date;
    endDate?: Date;
  }): Promise<OHLC[]> {
    const symbol = params.symbol.toUpperCase();
    const exchange = (params.exchange ?? "NSE").toUpperCase();
    const timeframe = params.timeframe ?? "Day";
    const end = params.endDate ?? new Date();
    const start =
      params.startDate ??
      new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);

    const key = cacheKey(symbol, exchange, timeframe);
    const cached = memoryCache.get(key);
    if (cached?.length) {
      const filtered = cached.filter((b) => b.date >= start && b.date <= end);
      if (filtered.length > 10) return forwardFillGaps(filtered);
    }

    const dbBars = await loadCandlesFromDb(symbol, exchange, timeframe, start, end);
    if (dbBars && dbBars.length > 10) {
      memoryCache.set(key, dbBars);
      return forwardFillGaps(dbBars);
    }

    const days = (end.getTime() - start.getTime()) / (86400 * 1000);
    let bars: OHLC[] = [];

    if (days > 400) {
      for (const chunk of chunkDateRanges(start, end)) {
        const chunkBars = await fetchYahooHistory(symbol, exchange, timeframe);
        bars = bars.concat(
          chunkBars.filter((b) => b.date >= chunk.from && b.date <= chunk.to)
        );
      }
    } else {
      try {
        bars = await fetchYahooHistory(symbol, exchange, timeframe);
        bars = bars.filter((b) => b.date >= start && b.date <= end);
      } catch (e) {
        writeSystemLog("ERROR", "MarketDataService", "Yahoo fetch failed", {
          symbol,
          error: e instanceof Error ? e.message : String(e),
        });
        return [];
      }
    }

    if (bars.length === 0) {
      const bhav = await fetchFromBhavcopyStub(symbol, start, end);
      if (bhav?.length) bars = bhav;
    }

    bars = forwardFillGaps(bars);
    memoryCache.set(key, bars);
    void persistCandlesAsync(symbol, exchange, timeframe, bars, "yahoo");

    return bars;
  }
}

export const marketDataService = new MarketDataService();
