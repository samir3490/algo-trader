import { NextRequest, NextResponse } from "next/server";
import { KiteConnect } from "kiteconnect";
import { getAccountToken, getAccountApiKey } from "@/lib/zerodha/account-token";
import { enrichHoldingRow } from "@/lib/market-data/enrich-holdings";

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

    const holdings = await Promise.all(
      (rawHoldings || []).map((h: Record<string, unknown>) =>
        enrichHoldingRow({
          symbol: String(h.tradingsymbol || ""),
          exchange: String(h.exchange || "NSE"),
          quantity: Number(h.quantity) || 0,
          average_price: Number(h.average_price) || 0,
          last_price: Number(h.last_price) || 0,
          close_price: Number(h.close_price) || 0,
          day_change_percentage: Number(h.day_change_percentage) || 0,
        })
      )
    );

    return NextResponse.json({ holdings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch holdings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
