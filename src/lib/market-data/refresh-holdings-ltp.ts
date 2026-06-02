/** Client-side: refresh LTP on paper/local holdings via market quote API */
export interface HoldingWithLtp {
  symbol: string;
  exchange: string;
  qty: number;
  avgPrice: number;
  ltp: number;
}

export async function refreshHoldingsLtpClient<T extends HoldingWithLtp>(
  holdings: T[]
): Promise<T[]> {
  if (holdings.length === 0) return holdings;

  const updated = await Promise.all(
    holdings.map(async (h) => {
      try {
        const res = await fetch(
          `/api/market/quote?symbol=${encodeURIComponent(h.symbol)}&exchange=${h.exchange}`
        );
        if (!res.ok) return h;
        const data = await res.json();
        if (data?.lastPrice && data.lastPrice > 0) {
          return { ...h, ltp: data.lastPrice };
        }
      } catch {
        /* keep existing */
      }
      return h;
    })
  );

  return updated;
}
