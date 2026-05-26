import { NextRequest, NextResponse } from "next/server";
import { KiteConnect } from "kiteconnect";
import { getAccountToken, getAccountApiKey } from "@/lib/zerodha/account-token";

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("accountId");
  const accessToken = getAccountToken(request, accountId);
  const apiKey = getAccountApiKey(request, accountId);
  const userId = accountId || request.cookies.get("kite_user_id")?.value;

  if (!accessToken || !userId || !apiKey) {
    return NextResponse.json({ connected: false });
  }

  try {
    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(accessToken);
    const profile = await kite.getProfile();

    return NextResponse.json({
      connected: true,
      userId: profile.user_id || userId,
      userName: profile.user_name,
      email: profile.email,
      broker: profile.broker,
    });
  } catch {
    return NextResponse.json({
      connected: true,
      userId,
      profileError: true,
    });
  }
}
