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

    // In production, save this to the user's session/database
    const response = NextResponse.redirect(new URL("/live-trading?connected=true", request.url));
    response.cookies.set("kite_access_token", session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 hours
    });
    response.cookies.set("kite_user_id", session.user_id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
    });

    return response;
  } catch (error) {
    console.error("Kite auth error:", error);
    return NextResponse.redirect(new URL("/live-trading?error=session_failed", request.url));
  }
}
