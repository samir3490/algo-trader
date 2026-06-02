import { NextRequest, NextResponse } from "next/server";
import { scanStrategiesForSignals } from "@/lib/strategies/scan-signals";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const strategies = body.strategies ?? [];
    const running = strategies.filter((s: { status: string }) => s.status === "running");

    if (running.length === 0) {
      return NextResponse.json({
        scanned: 0,
        signals: [],
        message: "No running strategies to scan",
      });
    }

    const { scanned, signals } = await scanStrategiesForSignals(strategies);

    return NextResponse.json({
      scanned,
      signals,
      scannedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
