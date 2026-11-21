import { NextRequest, NextResponse } from "next/server";
import { isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { resolvePaperStartingBalance } from "@/lib/paper-trading/balance";
import {
  listStrategyUserIds,
  loadPaperStateAdmin,
  loadUserSettingsAdmin,
} from "@/lib/compliance/admin-data";
import { buildPaperMonthPerformance } from "@/lib/compliance/paper-month-performance";

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

/** Compact last-N-days paper performance (FIFO realized) for all strategy users. */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const daysParam = Number(request.nextUrl.searchParams.get("days") || "30");
  const days =
    Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 366
      ? Math.floor(daysParam)
      : 30;

  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json(
      { ok: false, error: "FIREBASE_SERVICE_ACCOUNT_JSON not configured" },
      { status: 503 }
    );
  }

  const db = getAdminFirestore();
  const userIds = await listStrategyUserIds(db);
  const ranAt = new Date().toISOString();
  const results = [];

  for (const userId of userIds) {
    const [settings, paper] = await Promise.all([
      loadUserSettingsAdmin(db, userId),
      loadPaperStateAdmin(db, userId),
    ]);
    const startingBalance = resolvePaperStartingBalance(settings);
    const performance = buildPaperMonthPerformance(
      paper.trades ?? [],
      paper.holdings ?? [],
      paper.balance ?? startingBalance,
      startingBalance,
      days
    );
    results.push({
      userId,
      tradeCount: (paper.trades ?? []).length,
      performance,
    });
  }

  return NextResponse.json({ ok: true, ranAt, days, usersProcessed: results.length, results });
}
