import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import type { ActiveStrategy } from "@/lib/firebase";
import type { PaperTradingState } from "@/lib/firebase";
import { applyPaperSignal } from "@/lib/strategies/execute-paper";
import { scanStrategiesForSignals } from "@/lib/strategies/scan-signals";
import { inferStrategyType } from "@/lib/strategies/definitions";
import { sendOrderEmail } from "@/lib/email";
import type { StrategySignal } from "@/types";

const INITIAL_BALANCE = 1_000_000;

function todayKeyIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function signalDedupeKey(strategyId: string, action: string): string {
  return `${strategyId}:${action}:${todayKeyIST()}`;
}

function pruneDedupeKeys(keys: string[]): string[] {
  const today = todayKeyIST();
  return keys.filter((k) => k.endsWith(today)).slice(-500);
}

export interface UserRunResult {
  userId: string;
  scanned: number;
  signalsFound: number;
  tradesExecuted: number;
  skipped?: string;
}

export interface AllUsersRunResult {
  ok: boolean;
  ranAt: string;
  usersProcessed: number;
  totalTrades: number;
  results: UserRunResult[];
  error?: string;
}

async function loadPaperState(db: Firestore, userId: string): Promise<PaperTradingState> {
  const snap = await db.doc(`users/${userId}/data/paperTrading`).get();
  if (!snap.exists) {
    return { balance: INITIAL_BALANCE, holdings: [], trades: [] };
  }
  const data = snap.data()!;
  return {
    balance: data.balance ?? INITIAL_BALANCE,
    holdings: data.holdings ?? [],
    trades: data.trades ?? [],
  };
}

async function loadRunnerMeta(db: Firestore, userId: string) {
  const snap = await db.doc(`users/${userId}/data/strategyRunner`).get();
  const data = snap.data();
  return {
    dedupeKeys: pruneDedupeKeys((data?.dedupeKeys as string[]) ?? []),
    lastRunAt: (data?.lastRunAt as string) ?? null,
  };
}

export async function runStrategiesForUser(userId: string): Promise<UserRunResult> {
  const db = getAdminFirestore();

  const strategiesSnap = await db.doc(`users/${userId}/data/strategies`).get();
  if (!strategiesSnap.exists) {
    return { userId, scanned: 0, signalsFound: 0, tradesExecuted: 0, skipped: "no strategies" };
  }

  const items = (strategiesSnap.data()?.items ?? []) as ActiveStrategy[];
  const running = items.filter((s) => s.status === "running");
  if (running.length === 0) {
    return { userId, scanned: 0, signalsFound: 0, tradesExecuted: 0, skipped: "none running" };
  }

  const payload = running.map((s) => ({
    ...s,
    type: inferStrategyType(s.name),
  }));

  const { scanned, signals } = await scanStrategiesForSignals(payload);
  const { dedupeKeys: existingKeys } = await loadRunnerMeta(db, userId);
  const dedupe = new Set(existingKeys);

  let paperState = await loadPaperState(db, userId);
  let tradesExecuted = 0;
  const signalStrategyIds = new Set<string>();

  for (const sig of signals) {
    signalStrategyIds.add(sig.strategyId);
    const key = signalDedupeKey(sig.strategyId, sig.action);
    if (dedupe.has(key)) continue;

    const strat = running.find((s) => s.id === sig.strategyId);
    if (!strat) continue;

    if (strat.mode === "paper" && (sig.action === "BUY" || sig.action === "SELL")) {
      const signal: StrategySignal = {
        symbol: sig.symbol,
        action: sig.action as "BUY" | "SELL",
        price: sig.price,
        quantity: strat.params?.quantity ?? 1,
        reason: sig.reason,
        confidence: sig.confidence,
        timestamp: new Date(),
      };
      const { state, executed } = applyPaperSignal(
        paperState,
        signal,
        strat.exchange || "NSE"
      );
      if (executed) {
        paperState = state;
        dedupe.add(key);
        tradesExecuted += 1;

        const qty = strat.params?.quantity ?? 1;
        await sendOrderEmail({
          mode: "PAPER",
          symbol: sig.symbol,
          exchange: strat.exchange || "NSE",
          side: sig.action as "BUY" | "SELL",
          quantity: qty,
          price: sig.price,
          orderType: "MARKET",
          product: "CNC",
          status: "EXECUTED",
        });

        const orderId = `strat-${Date.now()}-${sig.symbol}`;
        await db.doc(`users/${userId}/orders/${orderId}`).set({
          id: orderId,
          time: new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }),
          symbol: sig.symbol,
          exchange: strat.exchange || "NSE",
          side: sig.action,
          qty,
          price: sig.price,
          orderType: "MARKET",
          product: "CNC",
          mode: "PAPER",
          status: "EXECUTED",
          date: todayKeyIST(),
          reason: sig.reason,
          strategyName: strat.name,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }
  }

  if (tradesExecuted > 0) {
    await db.doc(`users/${userId}/data/paperTrading`).set(
      {
        balance: paperState.balance,
        holdings: paperState.holdings,
        trades: (paperState.trades ?? []).slice(0, 500),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  const now = new Date().toISOString();
  const updatedStrategies = items.map((s) => {
    if (signalStrategyIds.has(s.id)) {
      return {
        ...s,
        signals: (s.signals ?? 0) + 1,
        lastRunAt: now,
        lastSignalReason: signals.find((x) => x.strategyId === s.id)?.reason,
      };
    }
    if (s.status === "running") {
      return { ...s, lastRunAt: now };
    }
    return s;
  });

  await db.doc(`users/${userId}/data/strategies`).set(
    { items: updatedStrategies, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  await db.doc(`users/${userId}/data/strategyRunner`).set(
    {
      dedupeKeys: [...dedupe],
      lastRunAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    userId,
    scanned,
    signalsFound: signals.length,
    tradesExecuted,
  };
}

export async function runStrategiesForAllUsers(): Promise<AllUsersRunResult> {
  const ranAt = new Date().toISOString();

  if (!isFirebaseAdminConfigured()) {
    return {
      ok: false,
      ranAt,
      usersProcessed: 0,
      totalTrades: 0,
      results: [],
      error: "FIREBASE_SERVICE_ACCOUNT_JSON not configured",
    };
  }

  const db = getAdminFirestore();
  const dataSnap = await db.collectionGroup("data").get();

  const userIds = new Set<string>();
  for (const docSnap of dataSnap.docs) {
    if (docSnap.id !== "strategies") continue;
    const userId = docSnap.ref.parent.parent?.id;
    if (userId) userIds.add(userId);
  }

  const results: UserRunResult[] = [];
  let totalTrades = 0;

  for (const userId of userIds) {
    try {
      const result = await runStrategiesForUser(userId);
      results.push(result);
      totalTrades += result.tradesExecuted;
    } catch (e) {
      console.error(`Strategy run failed for ${userId}:`, e);
      results.push({
        userId,
        scanned: 0,
        signalsFound: 0,
        tradesExecuted: 0,
        skipped: e instanceof Error ? e.message : "error",
      });
    }
  }

  return {
    ok: true,
    ranAt,
    usersProcessed: userIds.size,
    totalTrades,
    results,
  };
}
