import { NextRequest, NextResponse } from "next/server";
import { KiteConnect } from "kiteconnect";
import {
  jsonWithOptionalHeal,
  withKiteCredsRetry,
} from "@/lib/zerodha/resolve-session";

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("accountId");
  const result = await withKiteCredsRetry(request, accountId, async (creds) => {
    const kite = new KiteConnect({ api_key: creds.apiKey });
    kite.setAccessToken(creds.accessToken);
    const positions = await kite.getPositions();
    return { positions };
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }
  return jsonWithOptionalHeal(result.data, result.responseInit?.heal);
}
