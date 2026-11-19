import type { Firestore } from "firebase-admin/firestore";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type OrderRecord,
  type PaperTradingState,
  type StrategyRunnerMeta,
} from "@/lib/firebase";
import {
  antiChurnSettingsPersistPatch,
  normalizeAppSettings,
} from "@/lib/settings/normalize-settings";
import { resolvePaperStartingBalance } from "@/lib/paper-trading/balance";

export async function listStrategyUserIds(db: Firestore): Promise<string[]> {
  const dataSnap = await db.collectionGroup("data").get();
  const userIds = new Set<string>();
  for (const docSnap of dataSnap.docs) {
    if (docSnap.id !== "strategies") continue;
    const userId = docSnap.ref.parent.parent?.id;
    if (userId) userIds.add(userId);
  }
  return [...userIds];
}

export async function loadUserSettingsAdmin(
  db: Firestore,
  userId: string
): Promise<AppSettings> {
  const snap = await db.doc(`users/${userId}/data/settings`).get();
  if (!snap.exists) return normalizeAppSettings(DEFAULT_SETTINGS);
  const before = {
    ...DEFAULT_SETTINGS,
    ...snap.data(),
  } as AppSettings;
  const after = normalizeAppSettings(before);
  const patch = antiChurnSettingsPersistPatch(before, after);
  if (patch) {
    try {
      await db.doc(`users/${userId}/data/settings`).set(patch, { merge: true });
    } catch {
      /* best-effort persist */
    }
  }
  return after;
}

export async function loadPaperStateAdmin(
  db: Firestore,
  userId: string
): Promise<PaperTradingState> {
  const snap = await db.doc(`users/${userId}/data/paperTrading`).get();
  const settings = await loadUserSettingsAdmin(db, userId);
  if (!snap.exists) {
    return {
      balance: resolvePaperStartingBalance(settings),
      holdings: [],
      positions: [],
      trades: [],
    };
  }
  const data = snap.data()!;
  return {
    balance: data.balance ?? resolvePaperStartingBalance(settings),
    holdings: data.holdings ?? [],
    positions: data.positions ?? [],
    trades: data.trades ?? [],
  };
}

export async function loadRunnerMetaAdmin(
  db: Firestore,
  userId: string
): Promise<StrategyRunnerMeta> {
  const snap = await db.doc(`users/${userId}/data/strategyRunner`).get();
  return (snap.data() ?? {}) as StrategyRunnerMeta;
}

export async function loadOrdersAdmin(
  db: Firestore,
  userId: string,
  max = 1000
): Promise<OrderRecord[]> {
  try {
    const snap = await db
      .collection(`users/${userId}/orders`)
      .orderBy("createdAt", "desc")
      .limit(max)
      .get();
    return snap.docs.map((d) => d.data() as OrderRecord);
  } catch {
    return [];
  }
}
