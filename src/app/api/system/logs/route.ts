import { NextResponse } from "next/server";
import { getRecentSystemLogs } from "@/lib/core/system-log";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ logs: getRecentSystemLogs(150) });
}
