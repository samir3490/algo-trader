import { NextRequest, NextResponse } from "next/server";
import { runWeeklyShortlistForAllUsers } from "@/lib/compliance/run-compliance";
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

/** Weekly shortlist digest — Sunday ~18:00 IST (12:30 UTC). */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runWeeklyShortlistForAllUsers();
    return NextResponse.json(result);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Weekly shortlist cron failed";
    writeSystemLog("ERROR", "WeeklyShortlistCron", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
