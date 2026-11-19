import {
  resolveLiveQuote,
  type KiteCreds,
} from "@/lib/market-data/resolve-live-quote";

export interface HoldingPriceInput {
  symbol: string;
  exchange: string;
  quantity: number;
  average_price: number;
  last_price?: number;
  close_price?: number;
}

export interface EnrichedHoldingRow {
  tradingsymbol: string;
  exchange: string;
  quantity: number;
  average_price: number;
  last_price: number;
  invested: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  day_change_percentage: number;
  priceSource: "zerodha" | "yahoo" | "average";
}

const quoteCache = new Map<string, { ltp: number; dayChange: number; ts: number; source: string }>();
const CACHE_MS = 60_000;

async function getMarketLtp(
  symbol: string,
  exchange: string,
  kiteCreds?: KiteCreds | null
): Promise<{ ltp: number; changePercent: number; source: "zerodha" | "yahoo" } | null> {
  const key = `${exchange}:${symbol}`.toUpperCase();
  const cached = quoteCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_MS) {
    return {
      ltp: cached.ltp,
      changePercent: cached.dayChange,
      source: cached.source === "zerodha" ? "zerodha" : "yahoo",
    };
  }

  const quote = await resolveLiveQuote(symbol, exchange, kiteCreds);
  if (!quote?.lastPrice || quote.lastPrice <= 0) return null;

  quoteCache.set(key, {
    ltp: quote.lastPrice,
    dayChange: quote.changePercent,
    ts: Date.now(),
    source: quote.source,
  });
  return {
    ltp: quote.lastPrice,
    changePercent: quote.changePercent,
    source: quote.source,
  };
}

/** Resolve LTP and P&L for a holding (Zerodha first, Yahoo fallback). */
export async function enrichHoldingRow(
  h: HoldingPriceInput & { day_change_percentage?: number },
  kiteCreds?: KiteCreds | null
): Promise<EnrichedHoldingRow> {
  const symbol = String(h.symbol || "").toUpperCase();
  const exchange = String(h.exchange || "NSE").toUpperCase();
  const qty = Number(h.quantity) || 0;
  const avgPrice = Number(h.average_price) || 0;
  const zerodhaLtp = Number(h.last_price) || Number(h.close_price) || 0;

  let ltp = zerodhaLtp;
  let priceSource: EnrichedHoldingRow["priceSource"] = zerodhaLtp > 0 ? "zerodha" : "average";
  let dayChange = Number(h.day_change_percentage) || 0;

  if (ltp <= 0) {
    const market = await getMarketLtp(symbol, exchange, kiteCreds);
    if (market) {
      ltp = market.ltp;
      dayChange = market.changePercent;
      priceSource = market.source;
    } else if (avgPrice > 0) {
      ltp = avgPrice;
      priceSource = "average";
    }
  }

  // Prefer avg when LTP still missing so invested/current are not both zero.
  const mark = ltp > 0 ? ltp : avgPrice;
  const invested = qty * avgPrice;
  const currentValue = qty * mark;
  const pnl = currentValue - invested;
  const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;

  return {
    tradingsymbol: symbol,
    exchange,
    quantity: qty,
    average_price: avgPrice,
    last_price: mark,
    invested,
    currentValue,
    pnl,
    pnlPercent,
    day_change_percentage: dayChange,
    priceSource,
  };
}

export async function enrichHoldingsList(
  holdings: HoldingPriceInput[],
  kiteCreds?: KiteCreds | null
): Promise<EnrichedHoldingRow[]> {
  return Promise.all(
    holdings.map((h) =>
      enrichHoldingRow(
        {
          ...h,
          symbol: (h as { tradingsymbol?: string }).tradingsymbol || h.symbol,
        },
        kiteCreds
      )
    )
  );
}
