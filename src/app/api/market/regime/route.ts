import { NextRequest, NextResponse } from "next/server";
import { fetchMarketRegime } from "@/lib/market-data/market-regime";
import { getRequestKiteCreds } from "@/lib/zerodha/request-creds";

export async function GET(request: NextRequest) {
  try {
    const creds = getRequestKiteCreds(request);
    const data = await fetchMarketRegime(creds);
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch market regime";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
