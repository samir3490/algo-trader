import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { isLiveTradingEnabled } from "@/lib/core/config";
import { placeLiveAlgoOrder } from "@/lib/live-trading/place-live-algo-order";
import { fetchYahooQuote } from "@/lib/market-data/yahoo";
import { isMarketOpen } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorizeCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return { ok: false as const, status: 503, error: "CRON_SECRET missing" };
  }
  const auth = request.headers.get("authorization")?.trim() ?? "";
  const token = auth.startsWith("Bearer ")
    ? auth.slice("Bearer ".length).trim()
    : auth;
  if (!token || token !== secret) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }
  return { ok: true as const };
}

/**
 * One-shot live smoke BUY (qty 1) to verify Zerodha algo path + email.
 * GET /api/cron/live-smoke?symbol=SBIN
 */
export async function GET(request: NextRequest) {
  const auth = authorizeCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isLiveTradingEnabled()) {
    return NextResponse.json(
      { ok: false, error: "ENABLE_LIVE_TRADING is off" },
      { status: 503 }
    );
  }

  if (!isMarketOpen()) {
    return NextResponse.json({
      ok: false,
      skipped: true,
      reason: "Market closed (IST)",
    });
  }

  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json(
      { ok: false, error: "FIREBASE_SERVICE_ACCOUNT_JSON missing" },
      { status: 503 }
    );
  }

  const symbol = (
    request.nextUrl.searchParams.get("symbol") || "SBIN"
  ).toUpperCase();
  const exchange = request.nextUrl.searchParams.get("exchange") || "NSE";
  const db = getAdminFirestore();

  // Prefer the known strategy user; fall back to first users/* doc.
  let userId = "GEusDnVAwAaWJDGuPnbnLRmUZ5B3";
  const userSnap = await db.doc(`users/${userId}/data/settings`).get();
  if (!userSnap.exists) {
    const users = await db.collection("users").limit(1).get();
    if (users.empty) {
      return NextResponse.json({ ok: false, error: "No users found" }, { status: 404 });
    }
    userId = users.docs[0].id;
  }

  // Force kill switch on for this smoke test so the order is allowed.
  await db.doc(`users/${userId}/data/settings`).set(
    {
      liveAutoTradingEnabled: true,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  let price = 0;
  try {
    const q = await fetchYahooQuote(symbol, exchange);
    price = Number(q?.lastPrice ?? 0) || 0;
  } catch {
    /* placeLiveAlgoOrder still needs a positive price for BUY sizing gates */
  }
  if (price <= 0) price = 100;

  const result = await placeLiveAlgoOrder(db, userId, {
    side: "BUY",
    symbol,
    exchange,
    price,
    qty: 1,
    product: "CNC",
    settings: {
      liveOrderNotional: 5_000,
      liveCapitalLimit: 50_000,
      liveAutoTradingEnabled: true,
      liveRuleEnforceCapitalLimits: true,
    },
    strategyName: "Live smoke test",
    reason: "Manual smoke BUY qty 1 to verify live algo + email before market close",
  });

  return NextResponse.json({
    ok: result.ok,
    skipped: result.skipped,
    message: result.message,
    orderId: result.orderId,
    qty: result.qty,
    symbol,
    exchange,
    price,
    userId,
    ranAt: new Date().toISOString(),
  });
}
