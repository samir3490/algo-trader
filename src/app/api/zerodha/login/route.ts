import { NextRequest, NextResponse } from "next/server";
import { getCredentialByIndex, getDefaultCredential } from "@/lib/zerodha/credentials";

export async function GET(request: NextRequest) {
  const credIndex = parseInt(request.nextUrl.searchParams.get("credIndex") || "0", 10);
  const cred = getCredentialByIndex(credIndex) || getDefaultCredential();

  if (!cred) {
    const errorUrl = new URL("/settings?error=api_key_missing", request.url);
    return NextResponse.redirect(errorUrl);
  }

  const loginUrl = `https://kite.zerodha.com/connect/login?v=3&api_key=${cred.apiKey}`;
  const response = NextResponse.redirect(loginUrl, { status: 302 });

  // Store the API key temporarily so the callback knows which credentials to use
  response.cookies.set("kite_pending_apikey", cred.apiKey, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 300, // 5 minutes — enough for the OAuth round-trip
  });

  return response;
}
