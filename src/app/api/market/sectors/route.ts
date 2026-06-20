import { NextRequest, NextResponse } from "next/server";
import {
  fetchSectorPerformance,
  type SectorTimeframe,
} from "@/lib/market-data/sector-performance";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("timeframe") ?? "1d";
  if (raw !== "1d") {
    return NextResponse.json(
      { error: "Only timeframe=1d is supported in v1" },
      { status: 400 }
    );
  }

  try {
    const data = await fetchSectorPerformance(raw as SectorTimeframe);
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch sector performance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
