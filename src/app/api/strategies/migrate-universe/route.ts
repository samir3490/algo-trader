import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { buildNifty50UniverseStrategies } from "@/lib/universe/default-strategies";
import { DEFAULT_SETTINGS } from "@/lib/firebase";
import { normalizeAppSettings } from "@/lib/settings/normalize-settings";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Replace all active strategies with one Nifty 50 universe scanner per strategy type. */
export async function POST(request: NextRequest) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Server not configured (FIREBASE_SERVICE_ACCOUNT_JSON)." },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing authorization" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  let uid: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  let body: { mode?: "paper" | "live"; timeframe?: string } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body ok */
  }

  const db = getAdminFirestore();
  const prevSnap = await db.doc(`users/${uid}/data/strategies`).get();
  const previousCount = ((prevSnap.data()?.items as unknown[]) ?? []).length;

  const items = buildNifty50UniverseStrategies({
    mode: body.mode ?? "paper",
    timeframe: body.timeframe ?? "Day",
    universe: "nifty50",
  });

  await db.doc(`users/${uid}/data/strategies`).set(
    {
      items,
      updatedAt: FieldValue.serverTimestamp(),
      migratedToUniverseAt: new Date().toISOString(),
    },
    { merge: false }
  );

  const phase2Settings = normalizeAppSettings({
    ...DEFAULT_SETTINGS,
    positionSizingMode: "portfolio_pct",
    positionPct: 10,
    autoTrailingStop: true,
    trailingStopPercent: 2,
    maxHoldDays: 10,
    noProgressDays: 5,
    enableStrategySellSignals: true,
  });

  await db.doc(`users/${uid}/data/settings`).set(
    {
      positionSizingMode: phase2Settings.positionSizingMode,
      positionPct: phase2Settings.positionPct,
      atrRiskPct: phase2Settings.atrRiskPct,
      atrPeriod: phase2Settings.atrPeriod,
      atrStopMultiplier: phase2Settings.atrStopMultiplier,
      autoTrailingStop: phase2Settings.autoTrailingStop,
      trailingStopPercent: phase2Settings.trailingStopPercent,
      maxHoldDays: phase2Settings.maxHoldDays,
      noProgressDays: phase2Settings.noProgressDays,
      noProgressMinPct: phase2Settings.noProgressMinPct,
      enableStrategySellSignals: phase2Settings.enableStrategySellSignals,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return NextResponse.json({
    ok: true,
    previousCount,
    count: items.length,
    message: `Replaced ${previousCount} strategies with ${items.length} Nifty 50 universe scanners.`,
  });
}
