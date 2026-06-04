import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import type { ActiveStrategy } from "@/lib/firebase";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type PaperTradingState,
} from "@/lib/firebase";
import { applyPaperRiskExits } from "@/lib/risk/paper-risk-guard";
import { applyPaperSignal } from "@/lib/strategies/execute-paper";
import { scanStrategiesForSignals } from "@/lib/strategies/scan-signals";
import { consolidateSignalsForExecution } from "@/lib/strategies/consolidate-signals";
import { inferStrategyType } from "@/lib/strategies/definitions";
import {
  sendOrderEmail,
  sendScanDigestEmail,
  type ScanDigestLine,
} from "@/lib/email";
import {
  shouldSendEmailCategory,
  useScanDigestEmail,
} from "@/lib/email/notify-policy";
import { fetchYahooQuote } from "@/lib/market-data/yahoo";
import type { StrategySignal } from "@/types";
import type { OrderRecord } from "@/lib/firebase";
import {
  normalizePaperTrades,
  tradesNormalizedChanged,
} from "@/lib/paper-trades/normalize";

const INITIAL_BALANCE = 1_000_000;

function emailDedupeKey(symbol: string, side: string, tag: string, now = new Date()): string {
  const date = todayKeyIST();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const slot = Math.floor((ist.getHours() * 60 + ist.getMinutes()) / 15);
  return `EMAIL:${tag}:${symbol.toUpperCase()}:${side}:${date}:${slot}`;
}

function todayKeyIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** One paper trade per symbol + side per 15-minute window (intraday cron). */
function executionDedupeKey(
  symbol: string,
  action: string,
  now = new Date()
): string {
  const date = todayKeyIST();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const slot = Math.floor((ist.getHours() * 60 + ist.getMinutes()) / 15);
  return `${symbol.toUpperCase()}:${action}:${date}:${slot}`;
}

function pruneDedupeKeys(keys: string[]): string[] {
  const today = todayKeyIST();
  return keys
    .filter((k) => k.includes(`:${today}:`) || k.endsWith(`:${today}`))
    .slice(-500);
}

async function refreshPaperHoldingsLtp(
  holdings: PaperTradingState["holdings"]
): Promise<NonNullable<PaperTradingState["holdings"]>> {
  if (!holdings?.length) return [];
  const updated = [];
  for (const h of holdings) {
    let ltp = h.ltp > 0 ? h.ltp : h.avgPrice;
    try {
      const q = await fetchYahooQuote(h.symbol, h.exchange || "NSE");
      if (q?.lastPrice && q.lastPrice > 0) ltp = q.lastPrice;
    } catch {
      /* keep last ltp */
    }
    updated.push({ ...h, ltp });
  }
  return updated;
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

async function loadRecentOrders(
  db: Firestore,
  userId: string,
  max = 300
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

async function persistPaperState(
  db: Firestore,
  userId: string,
  paperState: PaperTradingState,
  orders: OrderRecord[] = []
): Promise<boolean> {
  try {
    const raw = paperState.trades ?? [];
    const trades = normalizePaperTrades(raw, orders).slice(0, 500);
    await db.doc(`users/${userId}/data/paperTrading`).set(
      {
        balance: paperState.balance,
        holdings: paperState.holdings,
        trades,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    paperState.trades = trades;
    return true;
  } catch (e) {
    console.error(`Failed to save paper state for ${userId}:`, e);
    return false;
  }
}

async function loadUserSettings(
  db: Firestore,
  userId: string
): Promise<AppSettings> {
  const snap = await db.doc(`users/${userId}/data/settings`).get();
  if (!snap.exists) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...snap.data() } as AppSettings;
}

async function loadRunnerMeta(db: Firestore, userId: string) {
  const snap = await db.doc(`users/${userId}/data/strategyRunner`).get();
  const data = snap.data();
  return {
    dedupeKeys: pruneDedupeKeys((data?.dedupeKeys as string[]) ?? []),
    emailDedupeKeys: pruneDedupeKeys((data?.emailDedupeKeys as string[]) ?? []),
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

  const { scanned, signals: rawSignals } = await scanStrategiesForSignals(payload);
  const userSettings = await loadUserSettings(db, userId);
  const { dedupeKeys: existingKeys, emailDedupeKeys: existingEmailKeys } =
    await loadRunnerMeta(db, userId);
  const dedupe = new Set(existingKeys);
  const emailDedupe = new Set(existingEmailKeys);
  const digestLines: ScanDigestLine[] = [];
  const digestMode = useScanDigestEmail(userSettings);

  function queueEmail(
    category: Parameters<typeof shouldSendEmailCategory>[1],
    line: ScanDigestLine,
    individual?: Parameters<typeof sendOrderEmail>[0]
  ) {
    const eKey = emailDedupeKey(line.symbol, line.side, category);
    if (emailDedupe.has(eKey)) return;
    if (!shouldSendEmailCategory(userSettings, category)) return;

    emailDedupe.add(eKey);
    digestLines.push(line);

    if (!digestMode && individual) {
      void sendOrderEmail(individual).catch(() => {});
    }
  }
  let paperState = await loadPaperState(db, userId);
  if (paperState.holdings?.length) {
    paperState = {
      ...paperState,
      holdings: await refreshPaperHoldingsLtp(paperState.holdings),
    };
  }
  const recentOrders = await loadRecentOrders(db, userId);
  const cleaned = normalizePaperTrades(paperState.trades ?? [], recentOrders);
  if (tradesNormalizedChanged(paperState.trades ?? [], cleaned)) {
    paperState = { ...paperState, trades: cleaned };
    await persistPaperState(db, userId, paperState, recentOrders);
  }

  const riskResult = applyPaperRiskExits(paperState, userSettings);
  if (riskResult.exits.length > 0) {
    paperState = riskResult.state;
    await persistPaperState(db, userId, paperState, recentOrders);
    for (const exit of riskResult.exits) {
      queueEmail(
        "risk_exit",
        {
          symbol: exit.symbol,
          exchange: exit.exchange,
          side: "SELL",
          quantity: exit.qty ?? 1,
          price: exit.price ?? 0,
          status: `RISK EXIT — ${exit.message}`,
        },
        {
          mode: "PAPER",
          symbol: exit.symbol,
          exchange: exit.exchange,
          side: "SELL",
          quantity: exit.qty ?? 1,
          price: exit.price ?? 0,
          orderType: "MARKET",
          product: userSettings.paperDefaultProduct,
          status: `RISK EXIT — ${exit.message}`,
        }
      );
    }
  }

  const signals = consolidateSignalsForExecution(
    rawSignals,
    running,
    paperState.holdings ?? []
  );

  let tradesExecuted = 0;
  const signalStrategyIds = new Set<string>();

  for (const sig of signals) {
    signalStrategyIds.add(sig.strategyId);
    const key = executionDedupeKey(sig.symbol, sig.action);
    if (dedupe.has(key)) continue;

    const strat = running.find((s) => s.id === sig.strategyId);
    if (!strat) continue;

    if (strat.mode === "paper" && (sig.action === "BUY" || sig.action === "SELL")) {
      const signal: StrategySignal = {
        symbol: sig.symbol,
        action: sig.action as "BUY" | "SELL",
        price: sig.price,
        quantity:
          strat.params?.quantity ?? userSettings.defaultQuantity ?? 1,
        reason: sig.reason,
        confidence: sig.confidence,
        timestamp: new Date(),
      };
      const { state, executed, message, executedQty } = applyPaperSignal(
        paperState,
        signal,
        strat.exchange || "NSE",
        {
          strategyId: strat.id,
          strategyName: strat.name,
          reason: sig.reason,
        }
      );

      const qty =
        strat.params?.quantity ?? userSettings.defaultQuantity ?? 1;
      const exchange = strat.exchange || "NSE";

      if (executed) {
        const saved = await persistPaperState(db, userId, state, recentOrders);
        if (!saved) {
          console.error(`Paper trade not saved for ${sig.symbol} ${sig.action}`);
          continue;
        }

        paperState = state;
        dedupe.add(key);
        tradesExecuted += 1;

        const tradeQty = executedQty ?? qty;

        queueEmail(
          "executed",
          {
            symbol: sig.symbol,
            exchange,
            side: sig.action as "BUY" | "SELL",
            quantity: tradeQty,
            price: sig.price,
            status: "EXECUTED",
            strategyName: strat.name,
          },
          {
            mode: "PAPER",
            symbol: sig.symbol,
            exchange,
            side: sig.action as "BUY" | "SELL",
            quantity: tradeQty,
            price: sig.price,
            orderType: "MARKET",
            product: userSettings.paperDefaultProduct,
            status: "EXECUTED",
            strategyName: strat.name,
          }
        );

        const orderId = `strat-${Date.now()}-${sig.symbol}`;
        await db.doc(`users/${userId}/orders/${orderId}`).set({
          id: orderId,
          time: new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }),
          symbol: sig.symbol.toUpperCase(),
          exchange,
          side: sig.action,
          qty: tradeQty,
          price: sig.price,
          orderType: "MARKET",
          product: userSettings.paperDefaultProduct,
          mode: "PAPER",
          status: "EXECUTED",
          date: todayKeyIST(),
          reason: sig.reason,
          strategyId: strat.id,
          strategyName: strat.name,
          createdAt: FieldValue.serverTimestamp(),
        });
      } else if (message) {
        queueEmail(
          "skipped",
          {
            symbol: sig.symbol,
            exchange,
            side: sig.action as "BUY" | "SELL",
            quantity: qty,
            price: sig.price,
            status: `SKIPPED — ${message}`,
            strategyName: strat.name,
          },
          {
            mode: "PAPER",
            symbol: sig.symbol,
            exchange,
            side: sig.action as "BUY" | "SELL",
            quantity: qty,
            price: sig.price,
            orderType: "MARKET",
            product: userSettings.paperDefaultProduct,
            status: `SKIPPED — ${message}`,
            strategyName: strat.name,
          }
        );
        dedupe.add(key);
      }
    } else if (strat.mode === "live" && (sig.action === "BUY" || sig.action === "SELL")) {
      dedupe.add(key);
      queueEmail(
        "live_signal",
        {
          symbol: sig.symbol,
          exchange: strat.exchange || "NSE",
          side: sig.action as "BUY" | "SELL",
          quantity:
            strat.params?.quantity ?? userSettings.defaultQuantity ?? 1,
          price: sig.price,
          status: "LIVE SIGNAL (manual)",
          strategyName: strat.name,
        },
        {
          mode: "LIVE",
          symbol: sig.symbol,
          exchange: strat.exchange || "NSE",
          side: sig.action as "BUY" | "SELL",
          quantity:
            strat.params?.quantity ?? userSettings.defaultQuantity ?? 1,
          price: sig.price,
          orderType: "MARKET",
          product: userSettings.defaultProduct || "MIS",
          status: `SIGNAL — place manually in Live Trading`,
          strategyName: strat.name,
        }
      );
    }
  }

  if (digestMode && digestLines.length > 0) {
    const ist = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
    );
    const slot = Math.floor((ist.getHours() * 60 + ist.getMinutes()) / 15);
    const digestKey = `EMAIL:DIGEST:${todayKeyIST()}:${slot}`;
    if (!emailDedupe.has(digestKey)) {
      emailDedupe.add(digestKey);
      await sendScanDigestEmail(digestLines);
    }
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
      emailDedupeKeys: [...emailDedupe],
      lastRunAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    userId,
    scanned,
    signalsFound: rawSignals.length,
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
