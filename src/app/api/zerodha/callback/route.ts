import { NextRequest, NextResponse } from "next/server";
import { KiteConnect } from "kiteconnect";
import { getCredentialByApiKey, getDefaultCredential } from "@/lib/zerodha/credentials";
import { APIKEY_PREFIX } from "@/lib/zerodha/account-token";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const requestToken = searchParams.get("request_token");
  const status = searchParams.get("status");

  if (status !== "success" || !requestToken) {
    return NextResponse.redirect(new URL("/settings?error=auth_failed", request.url));
  }

  // Determine which credentials were used for this login
  const pendingApiKey = request.cookies.get("kite_pending_apikey")?.value;
  const cred = pendingApiKey
    ? getCredentialByApiKey(pendingApiKey)
    : getDefaultCredential();

  if (!cred) {
    return NextResponse.redirect(new URL("/settings?error=api_key_missing", request.url));
  }

  try {
    const kite = new KiteConnect({ api_key: cred.apiKey });
    const session = await kite.generateSession(requestToken, cred.apiSecret);

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

    // Per-account token + API key cookies
    response.cookies.set(`kite_token_${userId}`, accessToken, cookieOptions);
    response.cookies.set(`${APIKEY_PREFIX}${userId}`, cred.apiKey, cookieOptions);

    // Legacy cookies for backward compatibility
    response.cookies.set("kite_access_token", accessToken, cookieOptions);
    response.cookies.set("kite_user_id", userId, cookieOptions);

    // Clean up temporary cookie
    response.cookies.delete("kite_pending_apikey");

    return response;
  } catch (error) {
    console.error("Kite auth error:", error);
    return NextResponse.redirect(new URL("/settings?error=session_failed", request.url));
  }
}
