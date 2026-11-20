import { NextRequest, NextResponse } from "next/server";
import { KiteConnect } from "kiteconnect";
import {
  jsonWithOptionalHeal,
  withKiteCredsRetry,
} from "@/lib/zerodha/resolve-session";

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
  const result = await withKiteCredsRetry(request, accountId, async (creds) => {
    const kite = new KiteConnect({ api_key: creds.apiKey });
    kite.setAccessToken(creds.accessToken);
    const margins = await kite.getMargins();
    const equity = parseEquityMargins((margins as any)?.equity);
    return {
      accountId: accountId || creds.kiteUserId,
      ...equity,
    };
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }
  return jsonWithOptionalHeal(result.data, result.responseInit?.heal);
}
