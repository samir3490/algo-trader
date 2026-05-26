import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const apiKey = process.env.KITE_API_KEY;

  if (!apiKey) {
    const errorUrl = new URL("/live-trading?error=api_key_missing", request.url);
    return NextResponse.redirect(errorUrl);
  }

  const loginUrl = `https://kite.zerodha.com/connect/login?v=3&api_key=${apiKey}`;
  return NextResponse.redirect(loginUrl, { status: 302 });
}
