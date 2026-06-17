import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyRequestUser } from "@/lib/api/verify-user";
import { assessPaperTradingHealth } from "@/lib/health/paper-trading-health";
import { isMarketOpen } from "@/lib/utils";
import type { OrderRecord, StrategyRunnerMeta } from "@/lib/firebase";
import type { PaperTradingState } from "@/lib/firebase";

export const dynamic = "force-dynamic";

async function loadUserHealthData(userId: string) {
  const db = getAdminFirestore();
  const [paperSnap, runnerSnap, ordersSnap] = await Promise.all([
    db.doc(`users/${userId}/data/paperTrading`).get(),
    db.doc(`users/${userId}/data/strategyRunner`).get(),
    db
      .collection(`users/${userId}/orders`)
      .orderBy("createdAt", "desc")
      .limit(300)
      .get()
      .catch(() => null),
  ]);

  const paperData = paperSnap.exists ? paperSnap.data()! : {};
  const paperState: PaperTradingState = {
    balance: paperData.balance ?? 1_000_000,
    holdings: paperData.holdings ?? [],
    positions: paperData.positions ?? [],
    trades: paperData.trades ?? [],
  };

  const runnerMeta = runnerSnap.exists
    ? (runnerSnap.data() as StrategyRunnerMeta)
    : {};

  const orders: OrderRecord[] =
    ordersSnap?.docs.map((d) => d.data() as OrderRecord) ?? [];

  return assessPaperTradingHealth({
    runnerMeta,
    paperState,
    orders,
    marketOpen: isMarketOpen(),
  });
}

/** Paper trading health: cron status, scan diagnostics, portfolio drift. */
export async function GET(request: NextRequest) {
  const auth = await verifyRequestUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const health = await loadUserHealthData(auth.uid);
    return NextResponse.json({ ok: true, health });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Health check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
