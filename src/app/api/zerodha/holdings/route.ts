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
    const holdings = await kite.getHoldings();
    return NextResponse.json({ holdings });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
