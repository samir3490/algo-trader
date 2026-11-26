import { NextRequest, NextResponse } from "next/server";
import { isMarketOpen } from "@/lib/utils";
import { runStrategiesForAllUsers } from "@/lib/strategies/run-server";
import { sendCronFailureAlert } from "@/lib/health/health-alerts";
import {
  getAdminFirestore,
  isFirebaseAdminConfigured,
} from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Read last saved scan summaries (no strategy run) — for post-mortem when market is closed. */
async function loadLastScanSummaries() {
  if (!isFirebaseAdminConfigured()) return [];
  const db = getAdminFirestore();
  const snap = await db.collectionGroup("data").get();
  const out: Array<{
    userId: string;
    lastCronAt?: string;
    lastScanSummary?: unknown;
  }> = [];
  for (const docSnap of snap.docs) {
    if (docSnap.id !== "strategyRunner") continue;
    const userId = docSnap.ref.parent.parent?.id;
    if (!userId) continue;
    const data = docSnap.data();
    out.push({
      userId,
      lastCronAt: data.lastCronAt as string | undefined,
      lastScanSummary: data.lastScanSummary ?? null,
    });
  }
  return out;
}

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

  const wantLastScan =
    request.nextUrl.searchParams.get("lastScan") === "1" ||
    request.nextUrl.searchParams.get("diag") === "1";

  // lastScan=1: return saved diagnostics without running strategies (works after hours).
  // After-hours scheduled hits still skip trading, but include lastScans for ops visibility.
  if (wantLastScan) {
    const ranAt = new Date().toISOString();
    const lastScans = await loadLastScanSummaries().catch(() => []);
    return NextResponse.json({
      ok: true,
      skipped: false,
      reason: "lastScan diagnostics only",
      ranAt,
      invokedBy: "cron",
      schedule: "Every 15 min, Mon–Fri 9:15–15:30 IST",
      lastScans,
    });
  }

  if (!isMarketOpen()) {
    const ranAt = new Date().toISOString();
    const lastScans = await loadLastScanSummaries().catch(() => []);
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Market closed (IST)",
      ranAt,
      invokedBy: "cron",
      schedule: "Every 15 min, Mon–Fri 9:15–15:30 IST",
      lastScans,
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
