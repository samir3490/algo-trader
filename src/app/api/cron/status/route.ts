import { NextResponse } from "next/server";
import { isMarketOpen } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Public schedule info — no auth required. */
export async function GET() {
  return NextResponse.json({
    autoTrading: true,
    schedule: "Every 15 minutes, Monday–Friday, 9:15 AM–3:30 PM IST",
    scheduler: "GitHub Actions → /api/cron/strategies",
    backupScheduler: "Vercel Cron once per weekday (mid-session backup)",
    marketOpen: isMarketOpen(),
    requirements: [
      "Strategies must be Running on the Strategies page",
      "Paper mode for automatic BUY orders (~₹1L each, max 5 positions)",
      "Exits via stop-loss / take-profit in Settings",
    ],
  });
}
