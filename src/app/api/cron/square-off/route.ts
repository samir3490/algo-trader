import { NextRequest, NextResponse } from "next/server";
import { runMisSquareOffForAllUsers } from "@/lib/compliance/run-compliance";
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

/** Force MIS square-off at configured time (weekdays ~15:15 IST). */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runMisSquareOffForAllUsers();
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Square-off cron failed";
    writeSystemLog("ERROR", "SquareOffCron", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
