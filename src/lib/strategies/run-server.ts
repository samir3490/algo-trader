import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import type { ActiveStrategy } from "@/lib/firebase";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type PaperTrade,
  type PaperTradingState,
} from "@/lib/firebase";
import {
  applyPaperRiskExits,
  ratchetPositionPeakPrices,
} from "@/lib/risk/paper-risk-guard";
import { exitCategoryLabel } from "@/lib/portfolio/exit-label";
import { scanStrategiesForSignals } from "@/lib/strategies/scan-signals";
import {
  ensurePositions,
  getOpenPositions,
  hasOpenPositionForSymbol,
} from "@/lib/portfolio/position-manager";
import {
  evaluatePortfolioDecisions,
  buyOnlyOpinions,
  scanSignalToOpinion,
  buildRankedPaperBuyQueue,
  buildRankedLiveBuyQueue,
  buildRankedPaperSellQueue,
  rankBuyOpinions,
} from "@/lib/portfolio/portfolio-manager";
import { loadLiveBook } from "@/lib/live-trading/live-book";
import { detectStrategyConflicts } from "@/lib/portfolio/conflict-detector";
import { resolvePaperStartingBalance, formatBuyStrength } from "@/lib/paper-trading/balance";
import { computePnlBreakdown } from "@/lib/portfolio/compute-portfolio";
import {
  capPaperTradeHistory,
  PAPER_TRADE_HISTORY_LIMIT,
} from "@/lib/paper-trades/history-limit";
import {
  selectTopBuyDecisionsForScan,
} from "@/lib/portfolio/buy-selection";
import {
  formatPaperBuySizingNote,
  formatPaperSizingSummary,
  integerShareQtyForBudget,
} from "@/lib/portfolio/paper-position-size";
import {
  antiChurnSettingsPersistPatch,
  normalizeAppSettings,
  resolvePaperBuyNotional,
  SIMPLE_PAPER_MAX_POSITIONS,
  SIMPLE_PAPER_MIN_BUY_SIGNALS,
} from "@/lib/settings/normalize-settings";
import { isPaperRuleOn } from "@/lib/settings/paper-rules";
import { isLiveRuleOn } from "@/lib/settings/live-rules";
import { placeLiveAlgoOrder } from "@/lib/live-trading/place-live-algo-order";
import { isLiveTradingEnabled } from "@/lib/core/config";
import { todayDateKeyIST } from "@/lib/portfolio/compute-portfolio";
import {
  mergeScanIntoDayRollup,
  pruneShortlistDayRollups,
  type ShortlistDayRollup,
} from "@/lib/export/weekly-shortlist";
import { buildNifty50UniverseStrategies } from "@/lib/universe/default-strategies";
import { STRATEGY_DEFINITIONS } from "@/lib/strategies/definitions";
import {
  ensurePaperTradingBalance,
  prunePaperStateForScan,
} from "@/lib/portfolio/paper-state-cleanup";
import { paperHoldingsSignature } from "@/lib/portfolio/rebuild-open-qty";
import { executePortfolioDecision } from "@/lib/portfolio/order-engine";
import {
  persistNewPaperTradesAsOrdersAdmin,
  persistPaperOrderAdmin,
} from "@/lib/portfolio/paper-order-record-server";
import { paperTradeToOrderRecord } from "@/lib/portfolio/paper-order-record";
import { appendUserAuditLogAdmin } from "@/lib/audit/user-audit-log-server";
import { formatTradeAuditMessage } from "@/lib/audit/trade-execution-audit";
import { formatScanAuditMessage, addScanDetail } from "@/lib/strategies/scan-diagnostics";
import { writeSystemLog } from "@/lib/core/system-log";
import { nowISTDateTimeString } from "@/lib/utils";
import {
  canExecuteStrategyTrade,
  lockSymbolForToday,
  pruneSymbolLocksForToday,
} from "@/lib/strategies/portfolio-gate";
import { tradeExecutedAtMs } from "@/lib/paper-trades/normalize";
import { inferStrategyType, type StrategyType } from "@/lib/strategies/definitions";
import { fetchYahooHistory } from "@/lib/market-data/history";
import {
  computeRegimeSnapshot,
  formatRegimeSummary,
  type RegimeSnapshot,
} from "@/lib/strategies/regime";
import { fetchSectorPerformance } from "@/lib/market-data/sector-performance";
import {
  buildSectorBiasContext,
  formatTradeReasonWithSector,
  lookupSectorBias,
  type SectorBiasContext,
} from "@/lib/portfolio/sector-bias";
import {
  automationAsAppSettings,
  resolveAutomationSettings,
} from "@/lib/settings/automation-settings";
import {
  sendOrderEmail,
  sendScanDigestEmail,
  type ScanDigestLine,
} from "@/lib/email";
import { maybeSendCronHealthAlerts } from "@/lib/health/health-alerts";
import { evaluateAutoPause } from "@/lib/strategies/auto-pause";
import {
  shouldSendEmailCategory,
  useScanDigestEmail,
} from "@/lib/email/notify-policy";
import { fetchYahooQuote } from "@/lib/market-data/yahoo";
import {
  resolvePaperExecutionPrice,
  MAX_EXECUTION_HINT_DEVIATION_PCT,
} from "@/lib/market-data/resolve-execution-price";
import type { OrderRecord } from "@/lib/firebase";
import {
  mergePaperFills,
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

import { sanitizePaperTradingPayload } from "@/lib/paper-trading/firestore-sanitize";
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

export interface AllUsersRunResult {
  ok: boolean;
  ranAt: string;
  usersProcessed: number;
  totalTrades: number;
  results: UserRunResult[];
  error?: string;
  invokedBy?: "cron" | "manual";
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
  max = PAPER_TRADE_HISTORY_LIMIT
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
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const raw = paperState.trades ?? [];
    const trades = capPaperTradeHistory(normalizePaperTrades(raw, orders));
    const payload = sanitizePaperTradingPayload({
      balance: paperState.balance,
      holdings: paperState.holdings,
      positions: paperState.positions,
      trades,
    });
    await db.doc(`users/${userId}/data/paperTrading`).set(
      {
        ...payload,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    paperState.trades = payload.trades;
    paperState.holdings = payload.holdings;
    paperState.positions = payload.positions;
    paperState.balance = payload.balance;
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`Failed to save paper state for ${userId}:`, e);
    return { ok: false, error };
  }
}

async function loadUserSettings(
  db: Firestore,
  userId: string
): Promise<AppSettings> {
  const snap = await db.doc(`users/${userId}/data/settings`).get();
  if (!snap.exists) return normalizeAppSettings(DEFAULT_SETTINGS);
  const raw = snap.data() as Record<string, unknown>;
  const before = {
    ...DEFAULT_SETTINGS,
    ...raw,
  } as AppSettings;
  const after = normalizeAppSettings(before);

  // One-shot: when server live trading is enabled, turn the user kill switch ON
  // once so BUY/SELL can run during market hours. Kill switch still works after.
  const alreadyBootstrapped = raw.liveAutoBootstrapDone === true;
  const bootstrapPatch =
    isLiveTradingEnabled() &&
    !alreadyBootstrapped &&
    after.liveAutoTradingEnabled !== true
      ? {
          liveAutoTradingEnabled: true,
          liveAutoBootstrapDone: true,
        }
      : isLiveTradingEnabled() && !alreadyBootstrapped
        ? { liveAutoBootstrapDone: true }
        : null;
  if (bootstrapPatch) {
    after.liveAutoTradingEnabled =
      bootstrapPatch.liveAutoTradingEnabled ?? after.liveAutoTradingEnabled;
  }

  const antiChurn = antiChurnSettingsPersistPatch(before, after);
  const patch: Record<string, unknown> = {
    ...(antiChurn ?? {}),
    ...(bootstrapPatch ?? {}),
  };
  if (Object.keys(patch).length > 0) {
    try {
      await db.doc(`users/${userId}/data/settings`).set(patch, { merge: true });
    } catch (e) {
      console.warn(`Failed to persist settings patch for ${userId}:`, e);
    }
  }
  return after;
}

async function logTradeExecutionAudit(
  db: Firestore,
  userId: string,
  trade: PaperTrade,
  source = "TradeExecution"
): Promise<void> {
  await appendUserAuditLogAdmin(db, userId, {
    severity: "INFO",
    source,
    message: formatTradeAuditMessage(trade),
    meta: {
      tradeId: trade.id,
      symbol: trade.symbol,
      exchange: trade.exchange,
      side: trade.side,
      qty: trade.qty,
      price: trade.price,
      netPnl: trade.netPnl,
      exitReason: trade.exitReason,
      strategyName: trade.strategyName,
      buySignalCount: trade.buySignalCount,
    },
  });
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
    lastCronAt: (data?.lastCronAt as string) ?? undefined,
    shortlistDayRollups:
      (data?.shortlistDayRollups as Record<string, ShortlistDayRollup> | undefined) ??
      {},
  };
}

async function ensureRunningUniverseStrategies(
  db: Firestore,
  userId: string,
  items: ActiveStrategy[]
): Promise<ActiveStrategy[]> {
  const paperRunning = items.filter(
    (s) => s.status === "running" && resolveStrategyMode(s) === "paper"
  );
  const universeCount = paperRunning.filter(
    (s) => Boolean(s.universe) || (s.symbols?.length ?? 0) >= 20
  ).length;

  // Cron was scanning only 1–2 strategies → zero BUY signals. Keep a full
  // Nifty 50 universe set so ranked shortlists actually form.
  if (
    paperRunning.length >= STRATEGY_DEFINITIONS.length &&
    universeCount >= Math.min(8, STRATEGY_DEFINITIONS.length)
  ) {
    return items;
  }

  const seeded = buildNifty50UniverseStrategies({
    mode: "paper",
    timeframe: "Day",
    universe: "nifty50",
  });
  const live = items.filter((s) => resolveStrategyMode(s) === "live");
  const next = [...seeded, ...live];
  await db.doc(`users/${userId}/data/strategies`).set(
    {
      items: next,
      updatedAt: FieldValue.serverTimestamp(),
      autoSeededUniverseAt: new Date().toISOString(),
    },
    { merge: true }
  );
  writeSystemLog("INFO", "StrategyScan", "auto_seeded_universe", {
    previousPaperRunning: paperRunning.length,
    seeded: seeded.length,
  });
  return next;
}

export async function runStrategiesForUser(
  userId: string,
  options?: { invokedBy?: "cron" | "manual" }
): Promise<UserRunResult> {
  const db = getAdminFirestore();

  const strategiesSnap = await db.doc(`users/${userId}/data/strategies`).get();
  if (!strategiesSnap.exists) {
    return { userId, scanned: 0, signalsFound: 0, tradesExecuted: 0, skipped: "no strategies" };
  }

  let items = ((strategiesSnap.data()?.items ?? []) as ActiveStrategy[]).map(
    (s) => ({ ...s, mode: resolveStrategyMode(s) })
  );
  const userSettingsEarly = await loadUserSettings(db, userId);
  if (isPaperRuleOn(userSettingsEarly, "ruleAutoSeedUniverse")) {
    items = await ensureRunningUniverseStrategies(db, userId, items);
  }
  const running = items.filter((s) => s.status === "running");
  if (running.length === 0) {
    return { userId, scanned: 0, signalsFound: 0, tradesExecuted: 0, skipped: "none running" };
  }

  const payload = running.map((s) => ({
    ...s,
    type: inferStrategyType(s.name),
  }));

  const userSettings = userSettingsEarly;
  const paperAutomation = resolveAutomationSettings(userSettings, "paper");
  const cronSettings = automationAsAppSettings(userSettings, paperAutomation);

  let regimeSnapshot: RegimeSnapshot | null = null;
  if (paperAutomation.enableRegimeWeighting !== false) {
    try {
      const indexSymbol = cronSettings.regimeIndexSymbol ?? "^NSEI";
      const indexBars = await fetchYahooHistory(indexSymbol, "NSE", "Day");
      regimeSnapshot = computeRegimeSnapshot(indexBars, cronSettings);
      if (regimeSnapshot) {
        writeSystemLog("INFO", "Regime", "index_adx", {
          summary: formatRegimeSummary(regimeSnapshot),
          regime: regimeSnapshot.regime,
          adx: regimeSnapshot.adx,
          adxSlope: regimeSnapshot.adxSlope,
          score: regimeSnapshot.regimeScore,
        });
      }
    } catch (e) {
      writeSystemLog("WARN", "Regime", "index_fetch_failed", {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  let sectorBias: SectorBiasContext | null = null;
  if (isPaperRuleOn(userSettings, "rulePreferStrongSectors")) {
    try {
      const sectorPayload = await fetchSectorPerformance("1d", {
        includeDrivers: false,
      });
      sectorBias = buildSectorBiasContext(
        sectorPayload.sectors,
        sectorPayload.fetchedAt
      );
      writeSystemLog("INFO", "SectorBias", "sector_performance", {
        summary: sectorBias.summaryLine,
        top: sectorBias.topSectors.slice(0, 3).map((s) => ({
          name: s.sectorName,
          changePercent: s.changePercent,
          rank: s.rank,
        })),
      });
    } catch (e) {
      writeSystemLog("WARN", "SectorBias", "sector_fetch_failed", {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const typeByStrategyId = new Map<string, StrategyType>();
  const strategyParamsById = new Map<string, Record<string, number>>();
  for (const s of running) {
    const t = inferStrategyType(s.name);
    typeByStrategyId.set(s.id, t);
    strategyParamsById.set(s.id, s.params ?? {});
  }

  const { scanned, signals: rawSignals } = await scanStrategiesForSignals(payload, {
    atrPeriod: userSettings.atrPeriod ?? 14,
  });
  const {
    emailDedupeKeys: existingEmailKeys,
    dedupeKeys: existingDedupeKeys,
    lastCronAt: previousLastCronAt,
    shortlistDayRollups: existingShortlistRollups,
    symbolCooldownUntil: loadedCooldown,
    symbolsLockedToday: loadedLocks,
  } = await loadRunnerMeta(db, userId);
  const emailDedupe = new Set(existingEmailKeys);
  const clearLocks = isPaperRuleOn(userSettings, "ruleClearRebuyLocks");
  // When the clear-locks rule is on, wipe day-locks so fills are not blocked.
  let symbolCooldownUntil: Record<string, number> = clearLocks
    ? {}
    : { ...loadedCooldown };
  let symbolsLockedToday: Record<string, string> = clearLocks
    ? {}
    : { ...loadedLocks };
  const dedupe = new Set(
    clearLocks
      ? [...existingDedupeKeys].filter(
          (k) => !k.startsWith("NO-BUY:") && !k.startsWith("BUY-TODAY:")
        )
      : existingDedupeKeys
  );
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
    priceCorrections: 0,
    liveSignals: 0,
    paperSignals: 0,
    strengthDeferred: 0,
    skipReasons: {},
    openPositions: 0,
    paperBalance: 0,
    maxPositions: 0,
  };

  const buyStrategiesBySymbol = new Map<string, string[]>();
  const sellStrategiesBySymbol = new Map<string, string[]>();

  for (const sig of rawSignals) {
    const strat = running.find((s) => s.id === sig.strategyId);
    const stratName = strat?.name ?? "Unknown";
    if (sig.action === "BUY") {
      diagnostics.buySignals += 1;
      const names = buyStrategiesBySymbol.get(sig.symbol) ?? [];
      if (!names.includes(stratName)) names.push(stratName);
      buyStrategiesBySymbol.set(sig.symbol, names);
      if (strat && resolveStrategyMode(strat) === "live") {
        addScanDetail(diagnostics, "liveOnly", sig.symbol, `BUY · ${stratName}`);
      }
    } else if (sig.action === "SELL") {
      diagnostics.sellSignals += 1;
      const names = sellStrategiesBySymbol.get(sig.symbol) ?? [];
      if (!names.includes(stratName)) names.push(stratName);
      sellStrategiesBySymbol.set(sig.symbol, names);
      if (strat && resolveStrategyMode(strat) === "live") {
        addScanDetail(diagnostics, "liveOnly", sig.symbol, `SELL · ${stratName}`);
      }
    }
  }

  for (const [symbol, names] of buyStrategiesBySymbol) {
    addScanDetail(diagnostics, "buySignals", symbol, names.join(", "));
  }
  for (const [symbol, names] of sellStrategiesBySymbol) {
    addScanDetail(diagnostics, "sellSignals", symbol, names.join(", "));
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
  const [loadedPaper, recentOrders] = await Promise.all([
    loadPaperState(db, userId),
    loadRecentOrders(db, userId),
  ]);
  const booksBefore = paperHoldingsSignature(ensurePositions(loadedPaper));
  let paperState = prunePaperStateForScan(
    ensurePaperTradingBalance(ensurePositions(loadedPaper), userSettings),
    recentOrders
  );
  const booksRepaired = booksBefore !== paperHoldingsSignature(paperState);
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
      positions: ratchetPositionPeakPrices(
        paperState.positions,
        ltpMap
      ),
      holdings: paperState.holdings,
    };
  }
  const cleaned = mergePaperFills(paperState.trades ?? [], recentOrders);
  const tradesChanged = tradesNormalizedChanged(
    paperState.trades ?? [],
    cleaned
  );
  if (tradesChanged) {
    paperState = { ...paperState, trades: cleaned };
  }
  const startBal = resolvePaperStartingBalance(userSettings);
  const pnlCheck = computePnlBreakdown(
    paperState.trades ?? [],
    paperState.holdings ?? [],
    paperState.balance ?? startBal,
    startBal
  );
  const cashRepaired = pnlCheck.cashRepaired;
  if (cashRepaired) {
    paperState = { ...paperState, balance: pnlCheck.portfolio.balance };
  }
  if (tradesChanged || booksRepaired || cashRepaired) {
    await persistPaperState(db, userId, paperState, recentOrders);
  }

  const tradesBeforeRisk = paperState.trades ?? [];
  const riskResult = applyPaperRiskExits(paperState, cronSettings);
  if (riskResult.exits.length > 0) {
    const beforeIds = new Set(tradesBeforeRisk.map((t) => t.id));
    const enrichedTrades = (riskResult.state.trades ?? []).map((t) => {
      if (beforeIds.has(t.id) || t.side !== "SELL") return t;
      const exit = riskResult.exits.find(
        (e) =>
          e.symbol.toUpperCase() === t.symbol.toUpperCase() &&
          (e.exchange || "NSE").toUpperCase() ===
            (t.exchange || "NSE").toUpperCase()
      );
      const riskSector = lookupSectorBias(t.symbol, sectorBias);
      const exitLabel = exitCategoryLabel({
        reason: exit?.reason,
        pnlPercent: exit?.pnlPercent,
      });
      const riskReason = formatTradeReasonWithSector({
        baseReason: `${exitLabel} — ${exit?.message ?? t.reason ?? "risk exit"}`,
        side: "SELL",
        entry: riskSector,
        symbol: t.symbol,
      });
      return { ...t, reason: riskReason };
    });
    paperState = ensurePositions({
      ...riskResult.state,
      trades: enrichedTrades,
    });
    await persistPaperState(db, userId, paperState, recentOrders);
    await persistNewPaperTradesAsOrdersAdmin(
      db,
      userId,
      tradesBeforeRisk,
      paperState.trades ?? [],
      { product: userSettings.paperDefaultProduct }
    );
    const newRiskTrades = (paperState.trades ?? []).filter(
      (t) => !tradesBeforeRisk.some((old) => old.id === t.id)
    );
    for (const t of newRiskTrades) {
      await logTradeExecutionAudit(db, userId, t, "RiskExit");
    }

    // Mirror risk exits to live Zerodha when auto-live is on.
    if (isLiveRuleOn(userSettings, "liveAutoTradingEnabled")) {
      for (const exit of riskResult.exits) {
        const liveSell = await placeLiveAlgoOrder(db, userId, {
          side: "SELL",
          symbol: exit.symbol,
          exchange: exit.exchange || "NSE",
          price: exit.price ?? 0,
          product: userSettings.defaultProduct || "CNC",
          settings: {
            liveOrderNotional: userSettings.liveOrderNotional,
            liveCapitalLimit: userSettings.liveCapitalLimit,
            liveAutoTradingEnabled: true,
            liveRuleEnforceCapitalLimits: isLiveRuleOn(
              userSettings,
              "liveRuleEnforceCapitalLimits"
            ),
          },
        });
        if (liveSell.ok) {
          diagnostics.liveSignals += 1;
          addScanDetail(
            diagnostics,
            "liveExec",
            exit.symbol,
            `LIVE SELL (risk) · qty ${liveSell.qty ?? "?"} · ${liveSell.orderId ?? ""}`
          );
        } else if (liveSell.message) {
          addScanDetail(
            diagnostics,
            "liveSkip",
            exit.symbol,
            liveSell.message
          );
        }
      }
    }

    const cooldownMs = (userSettings.rebuyCooldownMinutes ?? 0) * 60 * 1000;
    for (const exit of riskResult.exits) {
      const key = symKey(exit.symbol, exit.exchange);
      soldThisRun.add(key);
      if (cooldownMs > 0) {
        symbolCooldownUntil[key] = Date.now() + cooldownMs;
        symbolsLockedToday = lockSymbolForToday(
          symbolsLockedToday,
          exit.symbol,
          exit.exchange
        );
        dedupe.add(executionNoBuyTodayKey(exit.symbol));
      }
      const matched = newRiskTrades.find(
        (t) =>
          t.symbol.toUpperCase() === exit.symbol.toUpperCase() &&
          (t.exchange || "NSE").toUpperCase() ===
            (exit.exchange || "NSE").toUpperCase()
      );
      const riskReason =
        matched?.reason ??
        formatTradeReasonWithSector({
          baseReason: `${exitCategoryLabel(exit)} — ${exit.message}`,
          side: "SELL",
          entry: lookupSectorBias(exit.symbol, sectorBias),
          symbol: exit.symbol,
        });
      queueEmail(
        "risk_exit",
        {
          symbol: exit.symbol,
          exchange: exit.exchange,
          side: "SELL",
          quantity: exit.qty ?? 1,
          price: exit.price ?? 0,
          status: riskReason,
          reason: riskReason,
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
          status: riskReason,
          reason: riskReason,
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

  const { decisions } = evaluatePortfolioDecisions(
    buyOnlyOpinions(opinions),
    {
      state: paperState,
      settings: cronSettings,
      todayRealizedLoss: todayRealizedLoss(paperState.trades),
    }
  );
  const conflicts = detectStrategyConflicts(opinions);

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
  const portfolioCtx = {
    state: paperState,
    settings: cronSettings,
    todayRealizedLoss: todayRealizedLoss(paperState.trades),
  };

  const rankedOpinions = rankBuyOpinions(opinions, regimeSnapshot, sectorBias);
  const rankedForDisplay = rankedOpinions.map((op) => ({
    symbol: op.symbol,
    signalCount: op.buySignalCount ?? 1,
  }));

  // Ranked shortlist → prefer strong sectors, then buy in that order.
  const buyQueue = buildRankedPaperBuyQueue(
    opinions,
    portfolioCtx,
    regimeSnapshot,
    sectorBias
  );
  const openPositionCount = getOpenPositions(paperState).length;
  const maxPositions = cronSettings.maxPositions ?? SIMPLE_PAPER_MAX_POSITIONS;
  diagnostics.openPositions = openPositionCount;
  diagnostics.paperBalance = paperState.balance ?? 0;
  diagnostics.maxPositions = maxPositions;
  diagnostics.sizingSummary = formatPaperSizingSummary(userSettings);
  for (const pos of getOpenPositions(paperState)) {
    addScanDetail(
      diagnostics,
      "openPositions",
      pos.symbol,
      pos.ownerStrategyName
    );
  }
  const preferStrongSectors = isPaperRuleOn(
    userSettings,
    "rulePreferStrongSectors"
  );
  const minBuySignalCount = isPaperRuleOn(userSettings, "ruleMinBuySignals2")
    ? SIMPLE_PAPER_MIN_BUY_SIGNALS
    : 1;
  if (preferStrongSectors && sectorBias == null) {
    writeSystemLog("WARN", "SectorBias", "sector_required_skip_buys", {
      summary: "Strong-sector rule on but sector data missing — skipping buys",
    });
  }
  const {
    ranked: rankedQueue,
    slotsToFill,
    skippedQuality,
  } = selectTopBuyDecisionsForScan(buyQueue, {
    openPositionCount,
    maxPositions,
    minBuySignalCount,
    // Fail closed: when the rule is on, unknown / missing sector data does not fill slots.
    requireStrongSector: preferStrongSectors,
  });

  diagnostics.buyDecisions = rankedQueue.length;
  diagnostics.rankedBuyCandidates = rankedForDisplay;
  diagnostics.slotsToFill = slotsToFill;
  diagnostics.buyQueueSize = rankedQueue.length;
  for (const skip of skippedQuality) {
    bumpReason(diagnostics.skipReasons, skip.reason);
    diagnostics.gateBlocked += 1;
    addScanDetail(
      diagnostics,
      "gateBlocked",
      skip.decision.symbol,
      skip.reason
    );
  }
  for (const d of rankedQueue) {
    const count = d.buySignalCount ?? 1;
    const sectorNote = d.sectorName
      ? `${d.sectorName} ${d.sectorChangePercent != null ? `${d.sectorChangePercent >= 0 ? "+" : ""}${d.sectorChangePercent.toFixed(2)}%` : ""}`
      : undefined;
    addScanDetail(
      diagnostics,
      "buyApproved",
      d.symbol,
      [count > 1 ? `${count} strategies` : d.ownerStrategyName, sectorNote]
        .filter(Boolean)
        .join(" · ")
    );
  }

  let placedThisScan = 0;
  let queueIndex = 0;
  const deferReason = `Lower buy rank — max ${maxPositions} positions`;
  const boughtThisRun = new Set<string>();

  // Walk the ranked shortlist in order and fill every available slot.
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

    if (hasOpenPositionForSymbol(paperState, baseDecision.symbol, exchange)) {
      bumpReason(diagnostics.skipReasons, "Already holding — no add-on buy");
      diagnostics.gateBlocked += 1;
      addScanDetail(
        diagnostics,
        "gateBlocked",
        baseDecision.symbol,
        "Already holding — no add-on buy"
      );
      continue;
    }

    const buyGate = canExecuteStrategyTrade(
      "BUY",
      baseDecision.symbol,
      exchange,
      {
        holdings: paperState.holdings ?? [],
        positions: paperState.positions,
        trades: paperState.trades ?? [],
        settings: cronSettings,
        soldThisRun,
        boughtThisRun,
        symbolCooldownUntil,
        symbolsLockedToday,
        ownerStrategyId: baseDecision.ownerStrategyId,
      }
    );
    if (!buyGate.allowed) {
      bumpReason(
        diagnostics.skipReasons,
        buyGate.reason ?? "Blocked by trade gate"
      );
      diagnostics.gateBlocked += 1;
      addScanDetail(
        diagnostics,
        "gateBlocked",
        baseDecision.symbol,
        buyGate.reason ?? "Blocked by trade gate"
      );
      continue;
    }

    let price = baseDecision.price;
    let resolvedPrice = await resolvePaperExecutionPrice(
      baseDecision.symbol,
      exchange,
      price,
      { requireLive: false }
    );
    if (!resolvedPrice || resolvedPrice.price <= 0) {
      bumpReason(diagnostics.skipReasons, "Could not resolve market price");
      continue;
    }
    price = resolvedPrice.price;
    if (
      resolvedPrice.deviationPct != null &&
      resolvedPrice.deviationPct > MAX_EXECUTION_HINT_DEVIATION_PCT &&
      resolvedPrice.hintPrice != null
    ) {
      diagnostics.priceCorrections = (diagnostics.priceCorrections ?? 0) + 1;
      addScanDetail(
        diagnostics,
        "priceCorrected",
        baseDecision.symbol,
        `Hint ₹${resolvedPrice.hintPrice?.toFixed(2)} → live ₹${resolvedPrice.livePrice?.toFixed(2)}`
      );
      writeSystemLog("WARN", "StrategyScan", "execution_price_corrected", {
        symbol: baseDecision.symbol,
        exchange,
        hintPrice: resolvedPrice.hintPrice,
        livePrice: resolvedPrice.livePrice,
        deviationPct: Math.round(resolvedPrice.deviationPct * 100) / 100,
      });
    }

    const balance = paperState.balance ?? INITIAL_BALANCE;
    const orderNotional = resolvePaperBuyNotional(userSettings);
    const budget = Math.min(orderNotional, balance);
    const freshQty = integerShareQtyForBudget(price, budget, balance);
    if (freshQty <= 0 || price <= 0) {
      bumpReason(
        diagnostics.skipReasons,
        balance < price
          ? "Insufficient balance for 1 share"
          : `Could not size ₹${Math.round(orderNotional / 1000)}k order`
      );
      continue;
    }

    const strengthLabel =
      baseDecision.buySignalCount != null && baseDecision.buySignalCount > 0
        ? formatBuyStrength(baseDecision.buySignalCount)
        : undefined;
    const sizingNote = formatPaperBuySizingNote(userSettings, {
      qty: freshQty,
      price,
      balance,
    });
    const sectorEntry = lookupSectorBias(baseDecision.symbol, sectorBias);
    const detailedReason = formatTradeReasonWithSector({
      baseReason: baseDecision.signalReason || baseDecision.ownerStrategyName,
      side: "BUY",
      entry: sectorEntry,
      symbol: baseDecision.symbol,
      extra: [strengthLabel, sizingNote].filter((x): x is string => Boolean(x)),
    });

    const decision = {
      ...baseDecision,
      quantity: freshQty,
      price,
      signalReason: detailedReason,
    };

    diagnostics.paperSignals += 1;

    const { state, executed, message, executedQty, trade } = executePortfolioDecision(
      paperState,
      decision,
      {
        simulateBrokerage: userSettings.simulateBrokerage,
        product: userSettings.paperDefaultProduct,
      }
    );

    const qty = decision.quantity;

    if (executed) {
      // Ensure paper trade + order history store the same email reason.
      if (trade) {
        trade.reason = detailedReason;
        state.trades = (state.trades ?? []).map((t) =>
          t.id === trade.id ? { ...t, reason: detailedReason } : t
        );
      }

      const saved = await persistPaperState(db, userId, state, recentOrders);
      if (!saved.ok) {
        console.error(
          `Paper trade not saved for ${decision.symbol} ${decision.action}: ${saved.error}`
        );
        bumpReason(
          diagnostics.skipReasons,
          `Failed to save paper state — ${saved.error.slice(0, 120)}`
        );
        continue;
      }

      paperState = ensurePositions(state);
      dedupe.add(executionDedupeKey(decision.symbol));
      boughtThisRun.add(symKey(decision.symbol, exchange));
      tradesExecuted += 1;
      placedThisScan += 1;

      const tradeQty = executedQty ?? qty;
      addScanDetail(
        diagnostics,
        "paperExec",
        decision.symbol,
        `BUY · ${detailedReason}`
      );
      const execStatus = `EXECUTED · ${detailedReason}`;

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
          reason: detailedReason,
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
          reason: detailedReason,
        }
      );

      if (trade) {
        await logTradeExecutionAudit(db, userId, {
          ...trade,
          qty: tradeQty,
          reason: detailedReason,
        });
        await persistPaperOrderAdmin(
          db,
          userId,
          paperTradeToOrderRecord(
            {
              ...trade,
              qty: tradeQty,
              reason: detailedReason,
            },
            { product: userSettings.paperDefaultProduct, mode: "PAPER" }
          )
        );
      }

      if (resolveStrategyMode(strat) === "live") {
        diagnostics.liveSignals += 1;
      }
    } else if (message) {
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

  // Live auto-buys: independent position slots + capital from Zerodha book.
  // Paper max-positions / paper fills must not block live quota.
  if (isLiveRuleOn(userSettings, "liveAutoTradingEnabled")) {
    const liveBook = await loadLiveBook(db, userId);
    if (!liveBook.ok) {
      addScanDetail(
        diagnostics,
        "liveSkip",
        "—",
        liveBook.message || "Live book unavailable"
      );
    } else {
      const liveAutomation = resolveAutomationSettings(userSettings, "live");
      const liveMaxPositions =
        liveAutomation.maxPositions ??
        userSettings.liveMaxPositions ??
        SIMPLE_PAPER_MAX_POSITIONS;
      const liveMinBuySignals = isLiveRuleOn(
        userSettings,
        "liveRuleMinBuySignals3"
      )
        ? SIMPLE_PAPER_MIN_BUY_SIGNALS
        : 1;
      const livePreferStrong = isLiveRuleOn(
        userSettings,
        "liveRulePreferStrongSectors"
      );

      const liveQueue = buildRankedLiveBuyQueue(
        opinions,
        liveBook.openSymbols,
        regimeSnapshot,
        sectorBias
      );
      const liveSelect = selectTopBuyDecisionsForScan(liveQueue, {
        openPositionCount: liveBook.openCount,
        maxPositions: liveMaxPositions,
        minBuySignalCount: liveMinBuySignals,
        requireStrongSector: livePreferStrong,
      });

      addScanDetail(
        diagnostics,
        "liveExec",
        "—",
        `Live slots ${liveSelect.slotsToFill} · open ${liveBook.openCount}/${liveMaxPositions} · deployed ₹${Math.round(liveBook.deployed)}`
      );

      for (const skip of liveSelect.skippedQuality) {
        addScanDetail(
          diagnostics,
          "liveSkip",
          skip.decision.symbol,
          skip.reason
        );
      }

      let livePlaced = 0;
      const liveOpen = new Set(liveBook.openSymbols);
      let liveOpenCount = liveBook.openCount;
      let livePositions = [...liveBook.positions];
      let liveHoldings = [...liveBook.holdings];

      for (const decision of liveSelect.toExecute) {
        if (livePlaced >= liveSelect.slotsToFill) break;
        const sym = decision.symbol.toUpperCase();
        if (liveOpen.has(sym)) continue;

        const exchange = decision.exchange || "NSE";
        const liveResult = await placeLiveAlgoOrder(db, userId, {
          side: "BUY",
          symbol: decision.symbol,
          exchange,
          price: decision.price,
          product: userSettings.defaultProduct || "CNC",
          settings: {
            liveOrderNotional: userSettings.liveOrderNotional,
            liveCapitalLimit: userSettings.liveCapitalLimit,
            liveAutoTradingEnabled: true,
            liveRuleEnforceCapitalLimits: isLiveRuleOn(
              userSettings,
              "liveRuleEnforceCapitalLimits"
            ),
          },
          positions: livePositions,
          holdings: liveHoldings,
        });

        if (liveResult.ok) {
          livePlaced += 1;
          diagnostics.liveSignals += 1;
          liveOpen.add(sym);
          liveOpenCount += 1;
          const fillQty = liveResult.qty ?? 0;
          livePositions = [
            ...livePositions,
            { qty: fillQty, avgPrice: decision.price },
          ];
          addScanDetail(
            diagnostics,
            "liveExec",
            decision.symbol,
            `LIVE BUY · qty ${fillQty || "?"} · ${liveResult.orderId ?? ""} · live open ${liveOpenCount}/${liveMaxPositions}`
          );
          const reason =
            decision.signalReason ||
            `${decision.buySignalCount ?? 1} signals`;
          queueEmail(
            "executed",
            {
              symbol: decision.symbol,
              exchange,
              side: "BUY",
              quantity: fillQty,
              price: decision.price,
              status: `LIVE EXECUTED · ${reason}`,
              strategyName: decision.ownerStrategyName,
              reason,
            },
            {
              mode: "LIVE",
              symbol: decision.symbol,
              exchange,
              side: "BUY",
              quantity: fillQty,
              price: decision.price,
              orderType: "MARKET",
              product: userSettings.defaultProduct || "CNC",
              status: `LIVE EXECUTED · ${reason}`,
              strategyName: decision.ownerStrategyName,
              reason,
            }
          );
        } else if (liveResult.message) {
          addScanDetail(
            diagnostics,
            "liveSkip",
            decision.symbol,
            liveResult.message
          );
          if (
            /capital limit|No live capital|per-trade limit/i.test(
              liveResult.message
            )
          ) {
            break;
          }
        }
      }
    }
  }

  if (cronSettings.enableStrategySellSignals !== false) {
    portfolioCtx.state = paperState;
    const barsBySymbol = new Map<string, import("@/types").OHLC[]>();
    if (cronSettings.enableEntryConnectedExits !== false) {
      for (const pos of getOpenPositions(paperState)) {
        const sym = pos.symbol.toUpperCase();
        if (barsBySymbol.has(sym)) continue;
        try {
          const bars = await fetchYahooHistory(sym, pos.exchange || "NSE", "Day");
          barsBySymbol.set(sym, bars);
        } catch {
          /* skip bar fetch for symbol */
        }
      }
    }
    const sellQueue = buildRankedPaperSellQueue(opinions, portfolioCtx, {
      boughtThisScan: boughtThisRun,
      typeByStrategyId,
      strategyParamsById,
      barsBySymbol,
    });
    diagnostics.sellDecisions = sellQueue.length;
    diagnostics.sellQueueSize = sellQueue.length;
    for (const d of sellQueue) {
      addScanDetail(diagnostics, "sellApproved", d.symbol, d.ownerStrategyName);
    }

    for (const baseDecision of sellQueue) {
      signalStrategyIds.add(baseDecision.ownerStrategyId);
      const exchange = baseDecision.exchange || "NSE";
      const key = symKey(baseDecision.symbol, exchange);

      const gate = canExecuteStrategyTrade("SELL", baseDecision.symbol, exchange, {
        holdings: paperState.holdings ?? [],
        positions: paperState.positions,
        trades: paperState.trades ?? [],
        settings: cronSettings,
        soldThisRun,
        boughtThisRun,
        symbolCooldownUntil,
        symbolsLockedToday,
        ownerStrategyId: baseDecision.ownerStrategyId,
      });
      if (!gate.allowed) {
        bumpReason(diagnostics.skipReasons, gate.reason ?? "Blocked by trade gate");
        diagnostics.gateBlocked += 1;
        addScanDetail(
          diagnostics,
          "gateBlocked",
          baseDecision.symbol,
          gate.reason ?? "Blocked by trade gate"
        );
        continue;
      }

      const slotKey = executionDedupeKey(baseDecision.symbol);
      if (dedupe.has(slotKey)) {
        bumpReason(
          diagnostics.skipReasons,
          "Already traded this symbol in this 15-minute window"
        );
        diagnostics.dedupeBlocked += 1;
        addScanDetail(
          diagnostics,
          "dedupeBlocked",
          baseDecision.symbol,
          "Already traded this window"
        );
        continue;
      }

      let price = baseDecision.price;
      const resolvedPrice = await resolvePaperExecutionPrice(
        baseDecision.symbol,
        exchange,
        price,
        { requireLive: true }
      );
      if (!resolvedPrice) {
        bumpReason(diagnostics.skipReasons, "Could not resolve live market price");
        continue;
      }
      price = resolvedPrice.price;
      if (
        resolvedPrice.deviationPct != null &&
        resolvedPrice.deviationPct > MAX_EXECUTION_HINT_DEVIATION_PCT &&
        resolvedPrice.hintPrice != null
      ) {
        diagnostics.priceCorrections = (diagnostics.priceCorrections ?? 0) + 1;
        addScanDetail(
          diagnostics,
          "priceCorrected",
          baseDecision.symbol,
          `Hint ₹${resolvedPrice.hintPrice?.toFixed(2)} → live ₹${resolvedPrice.livePrice?.toFixed(2)}`
        );
        writeSystemLog("WARN", "StrategyScan", "execution_price_corrected", {
          symbol: baseDecision.symbol,
          exchange,
          hintPrice: resolvedPrice.hintPrice,
          livePrice: resolvedPrice.livePrice,
          deviationPct: Math.round(resolvedPrice.deviationPct * 100) / 100,
        });
      }

      const sellSector = lookupSectorBias(baseDecision.symbol, sectorBias);
      const sellReason = formatTradeReasonWithSector({
        baseReason:
          baseDecision.signalReason ||
          `SELL · ${baseDecision.ownerStrategyName}`,
        side: "SELL",
        entry: sellSector,
        symbol: baseDecision.symbol,
      });
      const decision = {
        ...baseDecision,
        price,
        signalReason: sellReason,
      };
      diagnostics.paperSignals += 1;

      const { state, executed, message, executedQty, trade } = executePortfolioDecision(
        paperState,
        decision,
        {
          simulateBrokerage: userSettings.simulateBrokerage,
          product: userSettings.paperDefaultProduct,
        }
      );

      if (executed) {
        if (trade) {
          trade.reason = sellReason;
          state.trades = (state.trades ?? []).map((t) =>
            t.id === trade.id ? { ...t, reason: sellReason } : t
          );
        }

        const saved = await persistPaperState(db, userId, state, recentOrders);
        if (!saved.ok) {
          console.error(
            `Paper trade not saved for ${decision.symbol} ${decision.action}: ${saved.error}`
          );
          bumpReason(
            diagnostics.skipReasons,
            `Failed to save paper state — ${saved.error.slice(0, 120)}`
          );
          continue;
        }

        paperState = ensurePositions(state);
        dedupe.add(executionDedupeKey(decision.symbol));
        soldThisRun.add(key);
        const cooldownMs = (userSettings.rebuyCooldownMinutes ?? 0) * 60 * 1000;
        if (cooldownMs > 0) {
          symbolCooldownUntil[key] = Date.now() + cooldownMs;
          symbolsLockedToday = lockSymbolForToday(
            symbolsLockedToday,
            decision.symbol,
            exchange
          );
          dedupe.add(executionNoBuyTodayKey(decision.symbol));
        }
        tradesExecuted += 1;
        addScanDetail(
          diagnostics,
          "paperExec",
          decision.symbol,
          `SELL · ${sellReason}`
        );

        const tradeQty = executedQty ?? decision.quantity;
        queueEmail(
          "executed",
          {
            symbol: decision.symbol,
            exchange,
            side: "SELL",
            quantity: tradeQty,
            price: decision.price,
            status: `EXECUTED · ${sellReason}`,
            strategyName: decision.ownerStrategyName,
            reason: sellReason,
          },
          {
            mode: "PAPER",
            symbol: decision.symbol,
            exchange,
            side: "SELL",
            quantity: tradeQty,
            price: decision.price,
            orderType: "MARKET",
            product: userSettings.paperDefaultProduct,
            status: `EXECUTED · ${sellReason}`,
            strategyName: decision.ownerStrategyName,
            reason: sellReason,
          }
        );

        if (trade) {
          await logTradeExecutionAudit(db, userId, {
            ...trade,
            qty: tradeQty,
            reason: sellReason,
          });
          await persistPaperOrderAdmin(
            db,
            userId,
            paperTradeToOrderRecord(
              { ...trade, qty: tradeQty, reason: sellReason },
              { product: userSettings.paperDefaultProduct, mode: "PAPER" }
            )
          );
        }

        const strat = running.find((s) => s.id === baseDecision.ownerStrategyId);
        if (strat && resolveStrategyMode(strat) === "live") {
          diagnostics.liveSignals += 1;
        }

        // Mirror strategy SELL to live when auto-live is on.
        if (isLiveRuleOn(userSettings, "liveAutoTradingEnabled")) {
          const liveSell = await placeLiveAlgoOrder(db, userId, {
            side: "SELL",
            symbol: decision.symbol,
            exchange,
            price: decision.price,
            product: userSettings.defaultProduct || "CNC",
            settings: {
              liveOrderNotional: userSettings.liveOrderNotional,
              liveCapitalLimit: userSettings.liveCapitalLimit,
              liveAutoTradingEnabled: true,
              liveRuleEnforceCapitalLimits: isLiveRuleOn(
                userSettings,
                "liveRuleEnforceCapitalLimits"
              ),
            },
          });
          if (liveSell.ok) {
            diagnostics.liveSignals += 1;
            addScanDetail(
              diagnostics,
              "liveExec",
              decision.symbol,
              `LIVE SELL · qty ${liveSell.qty ?? "?"} · ${liveSell.orderId ?? ""}`
            );
            queueEmail(
              "executed",
              {
                symbol: decision.symbol,
                exchange,
                side: "SELL",
                quantity: liveSell.qty ?? tradeQty,
                price: decision.price,
                status: `LIVE EXECUTED · ${sellReason}`,
                strategyName: decision.ownerStrategyName,
                reason: sellReason,
              },
              {
                mode: "LIVE",
                symbol: decision.symbol,
                exchange,
                side: "SELL",
                quantity: liveSell.qty ?? tradeQty,
                price: decision.price,
                orderType: "MARKET",
                product: userSettings.defaultProduct || "CNC",
                status: `LIVE EXECUTED · ${sellReason}`,
                strategyName: decision.ownerStrategyName,
                reason: sellReason,
              }
            );
          } else if (liveSell.message) {
            addScanDetail(
              diagnostics,
              "liveSkip",
              decision.symbol,
              liveSell.message
            );
          }
        }
      } else if (message) {
        bumpReason(diagnostics.skipReasons, message);
        queueEmail(
          "skipped",
          {
            symbol: decision.symbol,
            exchange,
            side: "SELL",
            quantity: decision.quantity,
            price: decision.price,
            status: `SKIPPED — ${message}`,
            strategyName: decision.ownerStrategyName,
          },
          {
            mode: "PAPER",
            symbol: decision.symbol,
            exchange,
            side: "SELL",
            quantity: decision.quantity,
            price: decision.price,
            orderType: "MARKET",
            product: userSettings.paperDefaultProduct,
            status: `SKIPPED — ${message}`,
            strategyName: decision.ownerStrategyName,
          }
        );
      }
    }
  }

  diagnostics.strengthDeferred = rankedQueue.length - queueIndex;
  for (let i = queueIndex; i < rankedQueue.length; i++) {
    const deferred = rankedQueue[i];
    const sectorDefer =
      deferred.sectorName != null
        ? `${deferred.sectorName} ${
            deferred.sectorChangePercent != null
              ? `${deferred.sectorChangePercent >= 0 ? "+" : ""}${deferred.sectorChangePercent.toFixed(2)}%`
              : ""
          }${deferred.sectorIsStrong ? " · strong" : " · lagging"}`
        : undefined;
    const detail = [
      deferred.buySignalCount
        ? `${deferred.buySignalCount} signal${deferred.buySignalCount !== 1 ? "s" : ""}`
        : deferred.ownerStrategyName,
      sectorDefer,
      deferReason,
    ]
      .filter(Boolean)
      .join(" · ");
    addScanDetail(diagnostics, "deferred", deferred.symbol, detail);
    bumpReason(
      diagnostics.skipReasons,
      deferred.sectorIsStrong === false
        ? "Lower priority — sector lagging vs leaders"
        : deferReason
    );
    writeSystemLog("INFO", "PortfolioManager", "Deferred buy (rank)", {
      symbol: rankedQueue[i].symbol,
      buySignalCount: rankedQueue[i].buySignalCount,
      strategy: rankedQueue[i].ownerStrategyName,
      sector: deferred.sectorName,
      sectorChangePercent: deferred.sectorChangePercent,
    });
  }

  for (const decision of decisions.filter((d) => d.action === "SKIP")) {
    signalStrategyIds.add(decision.ownerStrategyId);
    diagnostics.skippedDecisions += 1;
    const reason = decision.skipReason ?? "Portfolio skip";
    bumpReason(diagnostics.skipReasons, reason);
    addScanDetail(diagnostics, "portfolioSkip", decision.symbol, reason);
    if (/risk|loss|limit/i.test(reason)) {
      diagnostics.riskBlocked += 1;
      addScanDetail(diagnostics, "riskBlocked", decision.symbol, reason);
    }
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
      await sendScanDigestEmail(digestLines, {
        sizingSummary: diagnostics.sizingSummary,
        sectorSummary: sectorBias?.summaryLine,
      });
    }
  }

  const now = new Date().toISOString();
  let strategiesToSave = items.map((s) => {
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

  const autoPauses = evaluateAutoPause(
    strategiesToSave,
    paperState.trades ?? [],
    userSettings
  );
  if (autoPauses.length > 0) {
    const pauseById = new Map(autoPauses.map((p) => [p.strategyId, p]));
    strategiesToSave = strategiesToSave.map((s) => {
      const hit = pauseById.get(s.id);
      if (!hit) return s;
      writeSystemLog("WARN", "AutoPause", "strategy_auto_paused", {
        strategyId: s.id,
        strategyName: s.name,
        rollingPnl: hit.rollingPnl,
        reason: hit.reason,
      });
      return {
        ...s,
        status: "paused" as const,
        lastSignalReason: hit.reason,
      };
    });
  }

  await db.doc(`users/${userId}/data/strategies`).set(
    { items: strategiesToSave, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );

  await maybeSendCronHealthAlerts({
    invokedBy: options?.invokedBy,
    previousLastCronAt,
    signalsFound: rawSignals.length,
    tradesExecuted,
    diagnostics,
    emailDedupe,
    userId,
    digestLines,
  });

  const dateIST = todayDateKeyIST(new Date(now));
  const dayRollup = mergeScanIntoDayRollup(
    existingShortlistRollups[dateIST],
    diagnostics,
    { dateIST, ranAt: now, tradesExecuted }
  );
  const shortlistDayRollups = pruneShortlistDayRollups({
    ...existingShortlistRollups,
    [dateIST]: dayRollup,
  });

  await db.doc(`users/${userId}/data/strategyRunner`).set(
    {
      dedupeKeys: [...dedupe],
      emailDedupeKeys: [...emailDedupe],
      symbolCooldownUntil,
      symbolsLockedToday,
      lastRunAt: now,
      ...(options?.invokedBy === "cron" ? { lastCronAt: now } : {}),
      lastScanSummary: {
        ranAt: now,
        scanned,
        signalsFound: rawSignals.length,
        tradesExecuted,
        diagnostics,
      },
      shortlistDayRollups,
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

export async function runStrategiesForAllUsers(options?: {
  invokedBy?: "cron" | "manual";
}): Promise<AllUsersRunResult> {
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
      const result = await runStrategiesForUser(userId, options);
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
    invokedBy: options?.invokedBy,
  };
}
