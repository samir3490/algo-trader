import { NextRequest, NextResponse } from "next/server";
import { KiteConnect } from "kiteconnect";

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("kite_access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY! });
    kite.setAccessToken(accessToken);
    const holdings = await kite.getHoldings();
    return NextResponse.json({ holdings });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
