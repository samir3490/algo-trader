import { NextRequest, NextResponse } from "next/server";
import { runMonthlyLivePerformanceForAllUsers } from "@/lib/compliance/run-compliance";
import { writeSystemLog } from "@/lib/core/system-log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization")?.trim() ?? "";
  const token = auth.startsWith("Bearer ")
    ? auth.slice("Bearer ".length).trim()
    : auth;
  return token === secret;
}

/** Monthly live trading performance email — 1st of each month (~09:30 IST). */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const force = request.nextUrl.searchParams.get("force") === "1";
    const result = await runMonthlyLivePerformanceForAllUsers({ force });
    return NextResponse.json(result);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Monthly live performance cron failed";
    writeSystemLog("ERROR", "MonthlyLivePerformanceCron", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
