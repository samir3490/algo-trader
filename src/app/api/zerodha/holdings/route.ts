import { NextRequest, NextResponse } from "next/server";
import { KiteConnect } from "kiteconnect";
import { getAccountToken, getAccountApiKey } from "@/lib/zerodha/account-token";

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("accountId");
  const accessToken = getAccountToken(request, accountId);
  const apiKey = getAccountApiKey(request, accountId);
  if (!accessToken || !apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);
    const rawHoldings = await kite.getHoldings();

    const holdings = (rawHoldings || []).map((h: Record<string, unknown>) => {
      const qty = Number(h.quantity) || 0;
      const avgPrice = Number(h.average_price) || 0;
      const ltp = Number(h.last_price) || Number(h.close_price) || avgPrice;
      const invested = qty * avgPrice;
      const currentValue = qty * ltp;
      const pnl = Number(h.pnl) || currentValue - invested;
      const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;

      return {
        tradingsymbol: h.tradingsymbol,
        exchange: h.exchange,
        quantity: qty,
        average_price: avgPrice,
        last_price: ltp,
        pnl,
        invested,
        currentValue,
        pnlPercent,
        day_change_percentage: Number(h.day_change_percentage) || 0,
      };
    });

    return NextResponse.json({ holdings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch holdings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
