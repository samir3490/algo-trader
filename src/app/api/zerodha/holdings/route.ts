import { NextRequest, NextResponse } from "next/server";
import { KiteConnect } from "kiteconnect";
import { enrichHoldingRow } from "@/lib/market-data/enrich-holdings";
import {
  jsonWithOptionalHeal,
  withKiteCredsRetry,
} from "@/lib/zerodha/resolve-session";

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("accountId");
  const result = await withKiteCredsRetry(request, accountId, async (creds) => {
    const kite = new KiteConnect({ api_key: creds.apiKey });
    kite.setAccessToken(creds.accessToken);
    const rawHoldings = await kite.getHoldings();
    const kiteCreds = {
      apiKey: creds.apiKey,
      accessToken: creds.accessToken,
    };

    const holdings = (
      await Promise.all(
        (rawHoldings || []).map((h: Record<string, unknown>) => {
          const settled = Number(h.quantity) || 0;
          const t1 = Number(h.t1_quantity) || 0;
          const qty = settled + t1;
          return enrichHoldingRow(
            {
              symbol: String(h.tradingsymbol || ""),
              exchange: String(h.exchange || "NSE"),
              quantity: qty,
              average_price: Number(h.average_price) || 0,
              last_price: Number(h.last_price) || 0,
              close_price: Number(h.close_price) || 0,
              day_change_percentage: Number(h.day_change_percentage) || 0,
            },
            kiteCreds
          );
        })
      )
    ).filter((h) => h.quantity > 0);

    return { holdings };
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }
  return jsonWithOptionalHeal(result.data, result.responseInit?.heal);
}
