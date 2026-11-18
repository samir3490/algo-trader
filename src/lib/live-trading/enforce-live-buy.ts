import type { Firestore } from "firebase-admin/firestore";
import {
  evaluateLiveBuyLimits,
  type LiveCapitalSettings,
} from "@/lib/live-trading/capital-limits";
import { algoCapitalBook } from "@/lib/live-trading/live-book";
import { loadUserSettingsAdmin, listStrategyUserIds } from "@/lib/compliance/admin-data";

async function loadLiveSettings(db: Firestore): Promise<LiveCapitalSettings> {
  const userIds = await listStrategyUserIds(db);
  const userId = userIds[0];
  if (!userId) return {};
  const settings = await loadUserSettingsAdmin(db, userId);
  return {
    liveOrderNotional: settings.liveOrderNotional,
    liveCapitalLimit: settings.liveCapitalLimit,
    maxOrderValue: settings.maxOrderValue,
  };
}

async function loadAlgoDeployed(
  db: Firestore,
  appUserId?: string
): Promise<number> {
  const userId =
    appUserId ||
    (await listStrategyUserIds(db))[0];
  if (!userId) return 0;
  const snap = await db.doc(`users/${userId}/data/liveTrading`).get();
  if (!snap.exists) return 0;
  return Math.max(0, Number(snap.data()?.algoDeployedCapital ?? 0) || 0);
}

/**
 * Server-side gate for live BUY orders.
 * Uses algo-only deployed ₹ (not the full Zerodha holdings book).
 */
export async function assertLiveBuyWithinLimits(input: {
  db: Firestore;
  /** Kept for callers; capital gate is algo-only and does not read the broker book. */
  kite?: unknown;
  side: "BUY" | "SELL";
  qty: number;
  estimatedPrice: number;
  appUserId?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.side !== "BUY") return { ok: true };

  const settings = await loadLiveSettings(input.db);
  const deployed = await loadAlgoDeployed(input.db, input.appUserId);
  const book = algoCapitalBook(deployed);

  const result = evaluateLiveBuyLimits({
    side: "BUY",
    qty: input.qty,
    price: input.estimatedPrice,
    settings,
    positions: book.positions,
    holdings: book.holdings,
  });

  if (!result.ok) {
    return { ok: false, error: result.error || "Live capital limit blocked this buy." };
  }
  return { ok: true };
}
