import { NextRequest, NextResponse } from "next/server";
import { isMarketOpen } from "@/lib/utils";
import { runStrategiesForAllUsers } from "@/lib/strategies/run-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/** Cron endpoint: paper strategy scans + risk exits for all users (Vercel Cron or GitHub Actions). */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isMarketOpen()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Market closed (IST)",
      ranAt: new Date().toISOString(),
    });
  }

  try {
    const result = await runStrategiesForAllUsers();
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Cron run failed";
    console.error("Cron strategies error:", error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
