import { NextRequest, NextResponse } from "next/server";
import { KiteConnect } from "kiteconnect";

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("kite_access_token")?.value;
  const userId = request.cookies.get("kite_user_id")?.value;

  if (!accessToken || !userId) {
    return NextResponse.json({ connected: false });
  }

  try {
    const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY! });
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
