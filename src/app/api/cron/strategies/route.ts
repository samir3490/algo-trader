import { NextRequest, NextResponse } from "next/server";
import { isMarketOpen } from "@/lib/utils";
import { runStrategiesForAllUsers } from "@/lib/strategies/run-server";
import { sendCronFailureAlert } from "@/lib/health/health-alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type CronAuthResult =
  | { ok: true }
  | { ok: false; status: 503; error: string; hint: string }
  | { ok: false; status: 401; error: string; hint: string };

function authorizeCron(request: NextRequest): CronAuthResult {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: "CRON_SECRET not configured on server",
      hint: "Add CRON_SECRET in Vercel → Settings → Environment Variables (Production), then Redeploy.",
    };
  }

  const auth = request.headers.get("authorization")?.trim() ?? "";
  const token = auth.startsWith("Bearer ")
    ? auth.slice("Bearer ".length).trim()
    : auth;

  if (!token || token !== secret) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
      hint: "Bearer token must match CRON_SECRET on Vercel (no extra spaces or quotes). Redeploy after changing env vars.",
    };
  }

  return { ok: true };
}

/** Cron endpoint: paper strategy scans + risk exits for all users (Vercel Cron or GitHub Actions). */
export async function GET(request: NextRequest) {
  const auth = authorizeCron(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error, hint: auth.hint },
      { status: auth.status }
    );
  }

  if (!isMarketOpen()) {
    const ranAt = new Date().toISOString();
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Market closed (IST)",
      ranAt,
      invokedBy: "cron",
      schedule: "Every 15 min, Mon–Fri 9:15–15:30 IST",
    });
  }

  try {
    const result = await runStrategiesForAllUsers({ invokedBy: "cron" });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Cron run failed";
    console.error("Cron strategies error:", error);
    void sendCronFailureAlert(message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
