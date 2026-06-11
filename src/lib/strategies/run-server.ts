import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import type { ActiveStrategy } from "@/lib/firebase";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type PaperTradingState,
} from "@/lib/firebase";
import {
  applyPaperRiskExits,
  canPlacePaperBuy,
} from "@/lib/risk/paper-risk-guard";
import { scanStrategiesForSignals } from "@/lib/strategies/scan-signals";
import {
  ensurePositions,
  getOpenPositions,
} from "@/lib/portfolio/position-manager";
import {
  evaluatePortfolioDecisions,
  buyOnlyOpinions,
  scanSignalToOpinion,
  buildRankedPaperBuyQueue,
  rankBuyOpinions,
} from "@/lib/portfolio/portfolio-manager";
import { resolvePaperStartingBalance, formatBuyStrength } from "@/lib/paper-trading/balance";
import {
  selectTopBuyDecisionsForScan,
} from "@/lib/portfolio/buy-selection";
import { resolvePaperScanOrderQty } from "@/lib/portfolio/paper-position-size";
import { normalizeAppSettings } from "@/lib/settings/normalize-settings";
import { executePortfolioDecision } from "@/lib/portfolio/order-engine";
import { appendUserAuditLogAdmin } from "@/lib/audit/user-audit-log-server";
import { formatScanAuditMessage } from "@/lib/strategies/scan-diagnostics";
import { writeSystemLog } from "@/lib/core/system-log";
import { nowISTDateTimeString } from "@/lib/utils";
import {
  canExecuteStrategyTrade,
  lockSymbolForToday,
  pruneSymbolLocksForToday,
  type PortfolioGateContext,
} from "@/lib/strategies/portfolio-gate";
import { tradeExecutedAtMs } from "@/lib/paper-trades/normalize";
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

function symKey(symbol: string, exchange: string): string {
  return `${symbol.trim().toUpperCase()}:${(exchange || "NSE").trim().toUpperCase()}`;
}

/** One paper action per symbol per 15-minute window (blocks BUY+SELL whipsaw). */
function executionDedupeKey(symbol: string, now = new Date()): string {
  const date = todayKeyIST();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const slot = Math.floor((ist.getHours() * 60 + ist.getMinutes()) / 15);
  return `${symbol.toUpperCase()}:${date}:${slot}`;
}

/** Block further BUYs for this symbol for the rest of the IST day (set after a sell). */
function executionNoBuyTodayKey(symbol: string): string {
  return `NO-BUY:${symbol.toUpperCase()}:${todayKeyIST()}`;
}

function todayRealizedLoss(trades: PaperTradingState["trades"]): number {
  const today = todayKeyIST();
  let loss = 0;
  for (const t of trades ?? []) {
    if (t.side !== "SELL" || t.netPnl == null || t.netPnl >= 0) continue;
    const d =
      t.date ??
      new Date(tradeExecutedAtMs(t)).toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata",
      });
    if (d === today) loss += Math.abs(t.netPnl);
  }
  return loss;
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

import type { ScanDiagnostics } from "@/lib/strategies/scan-diagnostics";

export type { ScanDiagnostics };

export interface UserRunResult {
  userId: string;
  scanned: number;
  signalsFound: number;
  tradesExecuted: number;
  diagnostics?: ScanDiagnostics;
  skipped?: string;
}

function resolveStrategyMode(strat: ActiveStrategy): "paper" | "live" {
  return strat.mode === "live" ? "live" : "paper";
}

function bumpReason(map: Record<string, number>, reason: string) {
  map[reason] = (map[reason] ?? 0) + 1;
}

function clearFlatPortfolioLocks(
  paperState: PaperTradingState,
  dedupe: Set<string>,
  symbolsLockedToday: Record<string, string>,
  symbolCooldownUntil: Record<string, number>,
  maxPositions = 10
): {
  symbolsLockedToday: Record<string, string>;
  symbolCooldownUntil: Record<string, number>;
} {
  const openCount = getOpenPositions(paperState).length;
  const hasHoldings = (paperState.holdings ?? []).some((h) => (h.qty ?? 0) > 0);
  const slotsAvailable = openCount < maxPositions;

  if (slotsAvailable && !hasHoldings) {
    dedupe.clear();
    return { symbolsLockedToday: {}, symbolCooldownUntil: {} };
  }

  if (slotsAvailable) {
    dedupe.clear();
  }

  if (openCount > 0 || hasHoldings) {
    return { symbolsLockedToday, symbolCooldownUntil };
  }

  dedupe.clear();
  return { symbolsLockedToday: {}, symbolCooldownUntil: {} };
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
    return {
      balance: resolvePaperStartingBalance(await loadUserSettings(db, userId)),
      holdings: [],
      positions: [],
      trades: [],
    };
  }
  const data = snap.data()!;
  const settings = await loadUserSettings(db, userId);
  return {
    balance: data.balance ?? resolvePaperStartingBalance(settings),
    holdings: data.holdings ?? [],
    positions: data.positions ?? [],
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
        positions: (paperState.positions ?? []).slice(0, 200),
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
  if (!snap.exists) return normalizeAppSettings(DEFAULT_SETTINGS);
  return normalizeAppSettings({ ...DEFAULT_SETTINGS, ...snap.data() } as AppSettings);
}

async function loadRunnerMeta(db: Firestore, userId: string) {
  const snap = await db.doc(`users/${userId}/data/strategyRunner`).get();
  const data = snap.data();
  const raw = (data?.symbolCooldownUntil as Record<string, number>) ?? {};
  const now = Date.now();
  const symbolCooldownUntil: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "number" && v > now) symbolCooldownUntil[k] = v;
  }
  const symbolsLockedToday = pruneSymbolLocksForToday(
    (data?.symbolsLockedToday as Record<string, string>) ?? {}
  );
  return {
    dedupeKeys: pruneDedupeKeys((data?.dedupeKeys as string[]) ?? []),
    emailDedupeKeys: pruneDedupeKeys((data?.emailDedupeKeys as string[]) ?? []),
    symbolCooldownUntil,
    symbolsLockedToday,
    lastRunAt: (data?.lastRunAt as string) ?? null,
  };
}

export async function runStrategiesForUser(userId: string): Promise<UserRunResult> {
  const db = getAdminFirestore();

  const strategiesSnap = await db.doc(`users/${userId}/data/strategies`).get();
  if (!strategiesSnap.exists) {
    return { userId, scanned: 0, signalsFound: 0, tradesExecuted: 0, skipped: "no strategies" };
  }

  const items = ((strategiesSnap.data()?.items ?? []) as ActiveStrategy[]).map(
    (s) => ({ ...s, mode: resolveStrategyMode(s) })
  );
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
  const {
    dedupeKeys: existingKeys,
    emailDedupeKeys: existingEmailKeys,
    symbolCooldownUntil: persistedCooldown,
    symbolsLockedToday: persistedLocks,
  } = await loadRunnerMeta(db, userId);
  const dedupe = new Set(existingKeys);
  const emailDedupe = new Set(existingEmailKeys);
  let symbolCooldownUntil: Record<string, number> = { ...persistedCooldown };
  let symbolsLockedToday: Record<string, string> = { ...persistedLocks };
  const soldThisRun = new Set<string>();
  const digestLines: ScanDigestLine[] = [];
  const digestMode = useScanDigestEmail(userSettings);
  const diagnostics: ScanDiagnostics = {
    buySignals: 0,
    sellSignals: 0,
    buyDecisions: 0,
    sellDecisions: 0,
    skippedDecisions: 0,
    gateBlocked: 0,
    riskBlocked: 0,
    dedupeBlocked: 0,
    liveSignals: 0,
    paperSignals: 0,
    strengthDeferred: 0,
    skipReasons: {},
  };

  for (const sig of rawSignals) {
    if (sig.action === "BUY") diagnostics.buySignals += 1;
    else if (sig.action === "SELL") diagnostics.sellSignals += 1;
  }

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
  let paperState = ensurePositions(await loadPaperState(db, userId));
  const maxPositionsSetting = userSettings.maxPositions ?? 5;
  ({
    symbolsLockedToday,
    symbolCooldownUntil,
  } = clearFlatPortfolioLocks(
    paperState,
    dedupe,
    symbolsLockedToday,
    symbolCooldownUntil,
    maxPositionsSetting
  ));
  if (paperState.holdings?.length) {
    paperState = {
      ...paperState,
      holdings: await refreshPaperHoldingsLtp(paperState.holdings),
    };
    const ltpMap: Record<string, number> = {};
    for (const h of paperState.holdings) {
      ltpMap[symKey(h.symbol, h.exchange)] = h.ltp;
    }
    paperState = {
      ...paperState,
      positions: (paperState.positions ?? []).map((p) => ({
        ...p,
        ltp: ltpMap[symKey(p.symbol, p.exchange)] ?? p.ltp,
      })),
      holdings: paperState.holdings,
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
    const cooldownMs = (userSettings.rebuyCooldownMinutes ?? 240) * 60 * 1000;
    for (const exit of riskResult.exits) {
      const key = symKey(exit.symbol, exit.exchange);
      soldThisRun.add(key);
      symbolCooldownUntil[key] = Date.now() + cooldownMs;
      symbolsLockedToday = lockSymbolForToday(
        symbolsLockedToday,
        exit.symbol,
        exit.exchange
      );
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

  const opinions = rawSignals
    .map((sig) => {
      const strat = running.find((s) => s.id === sig.strategyId);
      if (!strat) return null;
      return scanSignalToOpinion(
        sig,
        strat,
        userSettings,
        paperState.balance ?? INITIAL_BALANCE
      );
    })
    .filter((o): o is NonNullable<typeof o> => o != null);

  const { decisions, conflicts } = evaluatePortfolioDecisions(
    buyOnlyOpinions(opinions),
    {
      state: paperState,
      settings: userSettings,
      todayRealizedLoss: todayRealizedLoss(paperState.trades),
    }
  );

  for (const conflict of conflicts) {
    writeSystemLog("WARN", "PortfolioManager", conflict.type, {
      symbol: conflict.symbol,
      exchange: conflict.exchange,
      message: conflict.message,
      buyStrategyIds: conflict.buyStrategyIds,
      sellStrategyIds: conflict.sellStrategyIds,
    });
  }

  let tradesExecuted = 0;
  const signalStrategyIds = new Set<string>();
  const gateCtx: PortfolioGateContext = {
    holdings: paperState.holdings ?? [],
    positions: paperState.positions,
    trades: paperState.trades ?? [],
    settings: userSettings,
    soldThisRun,
    symbolCooldownUntil,
    symbolsLockedToday,
    paperStrategyScan: true,
  };

  const portfolioCtx = {
    state: paperState,
    settings: userSettings,
    todayRealizedLoss: todayRealizedLoss(paperState.trades),
  };

  const rankedForDisplay = rankBuyOpinions(opinions).map((op) => ({
    symbol: op.symbol,
    signalCount: op.buySignalCount ?? 1,
  }));

  const buyQueue = buildRankedPaperBuyQueue(opinions, portfolioCtx);
  const openPositionCount = getOpenPositions(paperState).length;
  const maxPositions = userSettings.maxPositions ?? 5;
  const { ranked: rankedQueue, slotsToFill } = selectTopBuyDecisionsForScan(
    buyQueue,
    { openPositionCount, maxPositions }
  );

  diagnostics.buyDecisions = buyQueue.length;
  diagnostics.rankedBuyCandidates = rankedForDisplay;
  diagnostics.slotsToFill = slotsToFill;
  diagnostics.buyQueueSize = rankedQueue.length;

  let placedThisScan = 0;
  let queueIndex = 0;
  const deferReason = `Lower buy rank — max ${maxPositions} positions`;

  while (placedThisScan < slotsToFill && queueIndex < rankedQueue.length) {
    const baseDecision = rankedQueue[queueIndex];
    queueIndex += 1;
    signalStrategyIds.add(baseDecision.ownerStrategyId);

    const strat = running.find((s) => s.id === baseDecision.ownerStrategyId);
    if (!strat) {
      bumpReason(diagnostics.skipReasons, "Strategy not found for signal");
      continue;
    }

    const exchange = baseDecision.exchange || "NSE";
    const freshQty = resolvePaperScanOrderQty(baseDecision.price, userSettings, {
      strategyParams: strat.params,
      balance: paperState.balance ?? INITIAL_BALANCE,
    });
    if (freshQty <= 0 || baseDecision.price <= 0) {
      bumpReason(
        diagnostics.skipReasons,
        baseDecision.price <= 0
          ? "Invalid price"
          : "Share price exceeds order budget (whole shares only)"
      );
      continue;
    }
    const decision = { ...baseDecision, quantity: freshQty };

    diagnostics.paperSignals += 1;
    gateCtx.ownerStrategyId = decision.ownerStrategyId;
    const gate = canExecuteStrategyTrade(
      "BUY",
      decision.symbol,
      exchange,
      gateCtx
    );
    if (!gate.allowed) {
      diagnostics.gateBlocked += 1;
      bumpReason(diagnostics.skipReasons, gate.reason ?? "Gate blocked");
      const qty = decision.quantity;
      queueEmail(
        "skipped",
        {
          symbol: decision.symbol,
          exchange,
          side: "BUY",
          quantity: qty,
          price: decision.price,
          status: `SKIPPED — ${gate.reason}`,
          strategyName: decision.ownerStrategyName,
        },
        {
          mode: "PAPER",
          symbol: decision.symbol,
          exchange,
          side: "BUY",
          quantity: qty,
          price: decision.price,
          orderType: "MARKET",
          product: userSettings.paperDefaultProduct,
          status: `SKIPPED — ${gate.reason}`,
          strategyName: decision.ownerStrategyName,
        }
      );
      continue;
    }

    const orderValue = decision.quantity * decision.price;
    const buyCheck = canPlacePaperBuy({
      balance: paperState.balance ?? INITIAL_BALANCE,
      orderValue,
      qty: decision.quantity,
      price: decision.price,
      holdingsCount: getOpenPositions(paperState).length,
      settings: userSettings,
      todayRealizedLoss: todayRealizedLoss(paperState.trades),
    });
    if (!buyCheck.allowed) {
      diagnostics.riskBlocked += 1;
      bumpReason(diagnostics.skipReasons, buyCheck.message ?? "Risk blocked");
      queueEmail(
        "skipped",
        {
          symbol: decision.symbol,
          exchange,
          side: "BUY",
          quantity: decision.quantity,
          price: decision.price,
          status: `SKIPPED — ${buyCheck.message}`,
          strategyName: decision.ownerStrategyName,
        },
        {
          mode: "PAPER",
          symbol: decision.symbol,
          exchange,
          side: "BUY",
          quantity: decision.quantity,
          price: decision.price,
          orderType: "MARKET",
          product: userSettings.paperDefaultProduct,
          status: `SKIPPED — ${buyCheck.message}`,
          strategyName: decision.ownerStrategyName,
        }
      );
      continue;
    }

    const { state, executed, message, executedQty } = executePortfolioDecision(
      paperState,
      decision,
      {
        simulateBrokerage: userSettings.simulateBrokerage,
        product: userSettings.paperDefaultProduct,
      }
    );

    const qty = decision.quantity;
    const key = executionDedupeKey(decision.symbol);

    if (executed) {
      const saved = await persistPaperState(db, userId, state, recentOrders);
      if (!saved) {
        console.error(
          `Paper trade not saved for ${decision.symbol} ${decision.action}`
        );
        bumpReason(diagnostics.skipReasons, "Failed to save paper state");
        continue;
      }

      paperState = ensurePositions(state);
      gateCtx.holdings = paperState.holdings ?? [];
      gateCtx.positions = paperState.positions;
      gateCtx.trades = paperState.trades ?? [];
      dedupe.add(key);
      tradesExecuted += 1;
      placedThisScan += 1;

      const tradeQty = executedQty ?? qty;
      const strengthLabel =
        decision.buySignalCount != null && decision.buySignalCount > 0
          ? formatBuyStrength(decision.buySignalCount)
          : undefined;
      const execStatus = strengthLabel
        ? `EXECUTED · ${strengthLabel}`
        : "EXECUTED";

      queueEmail(
        "executed",
        {
          symbol: decision.symbol,
          exchange,
          side: "BUY",
          quantity: tradeQty,
          price: decision.price,
          status: execStatus,
          strategyName: decision.ownerStrategyName,
        },
        {
          mode: "PAPER",
          symbol: decision.symbol,
          exchange,
          side: "BUY",
          quantity: tradeQty,
          price: decision.price,
          orderType: "MARKET",
          product: userSettings.paperDefaultProduct,
          status: execStatus,
          strategyName: decision.ownerStrategyName,
        }
      );

      const orderId = `strat-${Date.now()}-${decision.symbol}`;
      await db.doc(`users/${userId}/orders/${orderId}`).set({
        id: orderId,
        time: nowISTDateTimeString(),
        symbol: decision.symbol.toUpperCase(),
        exchange,
        side: "BUY",
        qty: tradeQty,
        price: decision.price,
        orderType: "MARKET",
        product: userSettings.paperDefaultProduct,
        mode: "PAPER",
        status: "EXECUTED",
        date: todayKeyIST(),
        reason: strengthLabel
          ? `${decision.signalReason} · ${strengthLabel}`
          : decision.signalReason,
        strategyId: decision.ownerStrategyId,
        strategyName: decision.ownerStrategyName,
        createdAt: FieldValue.serverTimestamp(),
      });

      if (resolveStrategyMode(strat) === "live") {
        diagnostics.liveSignals += 1;
      }
    } else if (message) {
      diagnostics.riskBlocked += 1;
      bumpReason(diagnostics.skipReasons, message);
      queueEmail(
        "skipped",
        {
          symbol: decision.symbol,
          exchange,
          side: "BUY",
          quantity: qty,
          price: decision.price,
          status: `SKIPPED — ${message}`,
          strategyName: decision.ownerStrategyName,
        },
        {
          mode: "PAPER",
          symbol: decision.symbol,
          exchange,
          side: "BUY",
          quantity: qty,
          price: decision.price,
          orderType: "MARKET",
          product: userSettings.paperDefaultProduct,
          status: `SKIPPED — ${message}`,
          strategyName: decision.ownerStrategyName,
        }
      );
    }
  }

  diagnostics.strengthDeferred = rankedQueue.length - queueIndex;
  for (let i = queueIndex; i < rankedQueue.length; i++) {
    bumpReason(diagnostics.skipReasons, deferReason);
    writeSystemLog("INFO", "PortfolioManager", "Deferred buy (rank)", {
      symbol: rankedQueue[i].symbol,
      buySignalCount: rankedQueue[i].buySignalCount,
      strategy: rankedQueue[i].ownerStrategyName,
    });
  }

  for (const decision of decisions.filter((d) => d.action === "SKIP")) {
    signalStrategyIds.add(decision.ownerStrategyId);
    diagnostics.skippedDecisions += 1;
    bumpReason(
      diagnostics.skipReasons,
      decision.skipReason ?? "Portfolio skip"
    );
    writeSystemLog("INFO", "PortfolioManager", "Signal skipped", {
      symbol: decision.symbol,
      strategy: decision.ownerStrategyName,
      reason: decision.skipReason,
    });
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
        lastSignalReason: rawSignals.find((x) => x.strategyId === s.id)?.reason,
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
      symbolCooldownUntil,
      symbolsLockedToday,
      lastRunAt: now,
      lastScanSummary: {
        ranAt: now,
        scanned,
        signalsFound: rawSignals.length,
        tradesExecuted,
        diagnostics,
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const auditMessage = formatScanAuditMessage(
    rawSignals.length,
    tradesExecuted,
    diagnostics
  );
  await appendUserAuditLogAdmin(db, userId, {
    severity:
      rawSignals.length > 0 && tradesExecuted === 0 ? "WARN" : "INFO",
    source: "StrategyScan",
    message: auditMessage,
    meta: {
      scanned,
      signalsFound: rawSignals.length,
      tradesExecuted,
      diagnostics,
    },
  });

  return {
    userId,
    scanned,
    signalsFound: rawSignals.length,
    tradesExecuted,
    diagnostics,
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
