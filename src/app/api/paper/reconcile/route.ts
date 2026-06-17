import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyRequestUser } from "@/lib/api/verify-user";
import { reconcilePaperState } from "@/lib/portfolio/reconcile-paper-state";
import { sanitizePaperTradingPayload } from "@/lib/paper-trading/firestore-sanitize";
import type { OrderRecord, PaperTradingState } from "@/lib/firebase";

export const dynamic = "force-dynamic";

async function loadPaperAndOrders(userId: string) {
  const db = getAdminFirestore();
  const [paperSnap, ordersSnap] = await Promise.all([
    db.doc(`users/${userId}/data/paperTrading`).get(),
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

  const orders: OrderRecord[] =
    ordersSnap?.docs.map((d) => d.data() as OrderRecord) ?? [];

  return { paperState, orders };
}

/**
 * Reconcile holdings ↔ positions ↔ trades.
 * ?dryRun=1 — report issues only, no write.
 */
export async function POST(request: NextRequest) {
  const auth = await verifyRequestUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";

  try {
    const { paperState, orders } = await loadPaperAndOrders(auth.uid);
    const result = reconcilePaperState(paperState, orders);

    if (!dryRun && result.changes.length > 0) {
      const db = getAdminFirestore();
      const payload = sanitizePaperTradingPayload(result.state);
      await db.doc(`users/${auth.uid}/data/paperTrading`).set(
        {
          ...payload,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      fixed: result.fixed,
      changes: result.changes,
      issues: result.issues,
      issueCount: result.issues.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Reconcile failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** GET — dry-run reconcile (issues only). */
export async function GET(request: NextRequest) {
  const auth = await verifyRequestUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { paperState, orders } = await loadPaperAndOrders(auth.uid);
    const result = reconcilePaperState(paperState, orders);
    return NextResponse.json({
      ok: true,
      dryRun: true,
      changes: result.changes,
      issues: result.issues,
      issueCount: result.issues.length,
      wouldFix: result.changes.length > 0,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Reconcile check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
