import { NextRequest, NextResponse } from "next/server";
import { fetchMarketRegime } from "@/lib/market-data/market-regime";

export async function GET(_request: NextRequest) {
  try {
    const data = await fetchMarketRegime();
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch market regime";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
