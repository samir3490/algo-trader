import { NextRequest, NextResponse } from "next/server";
import { KiteConnect } from "kiteconnect";
import { getAccountToken, getAccountApiKey } from "@/lib/zerodha/account-token";

function parseEquityMargins(equity: any) {
  const available = equity?.available || {};
  const utilised = equity?.utilised || {};

  const cashAvailable =
    available.live_balance ??
    available.cash ??
    available.opening_balance ??
    0;

  return {
    available: Number(cashAvailable) || 0,
    used: Number(utilised.debits ?? utilised.m2m_realised ?? 0) || 0,
    net: Number(equity?.net ?? 0) || 0,
    openingBalance: Number(available.opening_balance ?? 0) || 0,
    collateral: Number(available.collateral ?? 0) || 0,
    enabled: equity?.enabled !== false,
  };
}

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
    const margins = await kite.getMargins();
    const equity = parseEquityMargins((margins as any)?.equity);

    return NextResponse.json({
      accountId: accountId || request.cookies.get("kite_user_id")?.value,
      ...equity,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
