import { NextRequest, NextResponse } from "next/server";
import { KiteConnect } from "kiteconnect";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const requestToken = searchParams.get("request_token");
  const status = searchParams.get("status");

  if (status !== "success" || !requestToken) {
    return NextResponse.redirect(new URL("/live-trading?error=auth_failed", request.url));
  }

  try {
    const kite = new KiteConnect({ api_key: process.env.KITE_API_KEY! });
    const session = await kite.generateSession(requestToken, process.env.KITE_API_SECRET!);

    const userId = session.user_id;
    const accessToken = session.access_token;

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      maxAge: 60 * 60 * 24,
    };

    const response = NextResponse.redirect(
      new URL(`/settings?account_added=${userId}`, request.url)
    );

    // Per-account token cookie
    response.cookies.set(`kite_token_${userId}`, accessToken, cookieOptions);

    // Also set legacy cookies for backward compatibility
    response.cookies.set("kite_access_token", accessToken, cookieOptions);
    response.cookies.set("kite_user_id", userId, cookieOptions);

    return response;
  } catch (error) {
    console.error("Kite auth error:", error);
    return NextResponse.redirect(new URL("/live-trading?error=session_failed", request.url));
  }
}
