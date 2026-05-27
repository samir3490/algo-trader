export interface ClientQuote {
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
  buyDepth?: { price: number; quantity: number; orders: number }[];
  sellDepth?: { price: number; quantity: number; orders: number }[];
  lowerCircuit?: number;
  upperCircuit?: number;
  totalBuyQty?: number;
  totalSellQty?: number;
  source?: string;
  priceNote?: string;
  hasDepth?: boolean;
}

/** Fetch quote from free market data (Yahoo). Works without Zerodha connection. */
export async function fetchMarketQuote(
  symbol: string,
  exchange: string
): Promise<ClientQuote | null> {
  try {
    const res = await fetch(
      `/api/market/quote?symbol=${encodeURIComponent(symbol.trim())}&exchange=${exchange}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.lastPrice || data.lastPrice <= 0) return null;
    return data as ClientQuote;
  } catch {
    return null;
  }
}

/** Optional: enrich with Zerodha market depth when connected */
export async function fetchZerodhaQuoteDepth(
  symbol: string,
  exchange: string,
  accountId: string
): Promise<ClientQuote | null> {
  try {
    const res = await fetch(
      `/api/zerodha/quote?symbol=${encodeURIComponent(symbol.trim())}&exchange=${exchange}&accountId=${accountId}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.lastPrice || data.lastPrice <= 0) return null;
    return { ...data, source: "zerodha", hasDepth: true };
  } catch {
    return null;
  }
}
