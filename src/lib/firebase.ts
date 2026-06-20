import { normalizeAppSettings } from "@/lib/settings/normalize-settings";
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyByeaBNfrEn_8i8Di8senf8rEqtQe0hii0",
  authDomain: "agrasen-technologies.firebaseapp.com",
  projectId: "agrasen-technologies",
  storageBucket: "agrasen-technologies.firebasestorage.app",
  messagingSenderId: "25276360178",
  appId: "1:25276360178:web:795e24fe883645203fb76b",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

let _overrideUid: string | null = null;

export function setFirebaseUid(uid: string | null) {
  _overrideUid = uid;
}

export function getUserId(): string {
  if (_overrideUid) return _overrideUid;
  const auth = getAuth(app);
  return auth.currentUser?.uid || "default_user";
}

// ==================== PAPER TRADING ====================

export type {
  ExitReason,
  PaperPosition,
  PositionState,
} from "@/lib/portfolio/types";

import type { ExitReason, PaperPosition } from "@/lib/portfolio/types";

export interface PaperTradingState {
  balance: number;
  /** Aggregated view — synced from open positions. */
  holdings: PaperHolding[];
  /** Authoritative owned positions (one owner per symbol by default). */
  positions?: PaperPosition[];
  trades: PaperTrade[];
  updatedAt?: any;
}

export interface PaperHolding {
  symbol: string;
  exchange: string;
  qty: number;
  avgPrice: number;
  ltp: number;
  ownerStrategyId?: string;
  ownerStrategyName?: string;
  buySignalCount?: number;
  signalStrategyNames?: string[];
}

export interface PaperTrade {
  id: string;
  time: string;
  /** ISO timestamp for sorting (newest first). */
  executedAt?: string;
  symbol: string;
  exchange: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  date?: string;
  strategyId?: string;
  ownerStrategyId?: string;
  strategyName?: string;
  reason?: string;
  product?: string;
  charges?: number;
  brokerage?: number;
  stt?: number;
  gst?: number;
  exchangeCharges?: number;
  sebiFees?: number;
  stampDuty?: number;
  netPnl?: number;
  grossAmount?: number;
  entryTime?: string;
  entryPrice?: number;
  exitTime?: string;
  exitPrice?: number;
  exitReason?: ExitReason;
  buySignalCount?: number;
  signalStrategyNames?: string[];
}

import {
  resolvePaperStartingBalance,
  DEFAULT_PAPER_STARTING_BALANCE,
} from "@/lib/paper-trading/balance";
import { sanitizePaperTradingPayload } from "@/lib/paper-trading/firestore-sanitize";

const INITIAL_BALANCE = DEFAULT_PAPER_STARTING_BALANCE;

export async function getPaperTradingState(): Promise<
  PaperTradingState & { cloudUpdatedAtMs?: number }
> {
  try {
    const ref = doc(db, "users", getUserId(), "data", "paperTrading");
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      const updatedAt = data.updatedAt;
      let cloudUpdatedAtMs: number | undefined;
      if (updatedAt && typeof updatedAt.toMillis === "function") {
        cloudUpdatedAtMs = updatedAt.toMillis();
      } else if (updatedAt?.seconds) {
        cloudUpdatedAtMs = updatedAt.seconds * 1000;
      }
      return {
        balance: data.balance ?? INITIAL_BALANCE,
        holdings: data.holdings ?? [],
        positions: data.positions ?? [],
        trades: data.trades ?? [],
        cloudUpdatedAtMs,
      };
    }
  } catch (e) {
    console.error("Error loading paper trading state:", e);
  }
  return { balance: INITIAL_BALANCE, holdings: [], positions: [], trades: [] };
}

export async function savePaperTradingState(state: PaperTradingState): Promise<void> {
  try {
    const ref = doc(db, "users", getUserId(), "data", "paperTrading");
    const payload = sanitizePaperTradingPayload(state);
    await setDoc(ref, {
      ...payload,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.error("Error saving paper trading state:", e);
    throw e;
  }
}

/** Remove paper order history from Firestore (Orders page reads this collection). */
export async function clearPaperOrders(): Promise<void> {
  try {
    const ref = collection(db, "users", getUserId(), "orders");
    const snap = await getDocs(query(ref, limit(500)));
    const deletes = snap.docs
      .filter((d) => {
        const mode = d.data().mode as string | undefined;
        return !mode || mode === "PAPER";
      })
      .map((d) => deleteDoc(d.ref));
    await Promise.all(deletes);
  } catch (e) {
    console.error("Error clearing paper orders:", e);
  }
}

export interface StrategyRunnerMeta {
  lastRunAt?: string;
  /** Last automated cron scan (weekdays, market hours). */
  lastCronAt?: string;
  /** IST date (YYYY-MM-DD) when daily P&L email was last sent. */
  lastDailyPnlEmailDate?: string;
  lastDailyPnlEmailAt?: string;
  lastScanSummary?: {
    ranAt: string;
    scanned: number;
    signalsFound: number;
    tradesExecuted: number;
    diagnostics?: {
      buySignals: number;
      sellSignals: number;
      buyDecisions: number;
      sellDecisions: number;
      skippedDecisions: number;
      gateBlocked: number;
      riskBlocked: number;
      dedupeBlocked: number;
      priceCorrections?: number;
      liveSignals: number;
      paperSignals: number;
      strengthDeferred?: number;
      slotsToFill?: number;
      buyQueueSize?: number;
      rankedBuyCandidates?: { symbol: string; signalCount: number }[];
      skipReasons: Record<string, number>;
      openPositions?: number;
      paperBalance?: number;
      maxPositions?: number;
      details?: Partial<
        Record<
          string,
          { symbol: string; meta?: string }[]
        >
      >;
    };
  };
}

export async function getStrategyRunnerMeta(): Promise<StrategyRunnerMeta> {
  try {
    const ref = doc(db, "users", getUserId(), "data", "strategyRunner");
    const snap = await getDoc(ref);
    if (snap.exists()) return snap.data() as StrategyRunnerMeta;
  } catch (e) {
    console.error("Error loading strategy runner meta:", e);
  }
  return {};
}

export async function clearStrategyRunnerState(): Promise<void> {
  try {
    const ref = doc(db, "users", getUserId(), "data", "strategyRunner");
    await setDoc(ref, {
      dedupeKeys: [],
      emailDedupeKeys: [],
      symbolCooldownUntil: {},
      symbolsLockedToday: {},
      lastRunAt: null,
      lastScanSummary: null,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.error("Error clearing strategy runner state:", e);
  }
}

export async function applyPaperStartingBalanceIfFlat(): Promise<
  "applied" | "skipped_has_positions" | "error"
> {
  try {
    const settings = await getSettings();
    const starting = resolvePaperStartingBalance(settings);
    const paper = await getPaperTradingState();
    const open =
      paper.positions?.filter(
        (p) => p.state === "OPEN" || p.state === "PARTIAL_EXIT"
      ) ?? [];
    const hasHoldings = paper.holdings?.some((h) => (h.qty ?? 0) > 0);
    if (open.length > 0 || hasHoldings) return "skipped_has_positions";
    await savePaperTradingState({ ...paper, balance: starting });
    return "applied";
  } catch (e) {
    console.error("Error applying paper starting balance:", e);
    return "error";
  }
}

export async function resetPaperTrading(): Promise<void> {
  const settings = await getSettings();
  const starting = resolvePaperStartingBalance(settings);
  await clearPaperOrders();
  await clearStrategyRunnerState();
  const ref = doc(db, "users", getUserId(), "data", "paperTrading");
  await setDoc(ref, {
    balance: starting,
    holdings: [],
    positions: [],
    trades: [],
    updatedAt: serverTimestamp(),
  });
  try {
    const { appendUserAuditLog } = await import("@/lib/audit/user-audit-log");
    await appendUserAuditLog({
      severity: "INFO",
      source: "PaperTrading",
      message: `Paper portfolio reset — balance restored to ₹${starting.toLocaleString("en-IN")}; holdings, orders, and scan locks cleared.`,
    });
  } catch (e) {
    console.error("Reset succeeded but audit log write failed:", e);
  }
}

// ==================== WATCHLIST ====================

export interface WatchlistItem {
  symbol: string;
  exchange: string;
}

export async function getWatchlist(): Promise<WatchlistItem[]> {
  try {
    const ref = doc(db, "users", getUserId(), "data", "watchlist");
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data().items ?? [];
    }
  } catch (e) {
    console.error("Error loading watchlist:", e);
  }
  return [
    { symbol: "RELIANCE", exchange: "NSE" },
    { symbol: "TCS", exchange: "NSE" },
    { symbol: "HDFCBANK", exchange: "NSE" },
    { symbol: "INFY", exchange: "NSE" },
    { symbol: "SBIN", exchange: "NSE" },
  ];
}

export async function saveWatchlist(items: WatchlistItem[]): Promise<void> {
  try {
    const ref = doc(db, "users", getUserId(), "data", "watchlist");
    await setDoc(ref, { items, updatedAt: serverTimestamp() });
  } catch (e) {
    console.error("Error saving watchlist:", e);
  }
}

// ==================== SETTINGS ====================

export interface AppSettings {
  defaultExchange: string;
  /** Live Zerodha default product (MIS/CNC/NRML). */
  defaultProduct: string;
  defaultOrderType: string;
  /** Legacy share count — paper strategies use paperOrderNotional instead. */
  defaultQuantity: number;
  /** Target rupee value per paper BUY (default ₹1,00,000). */
  paperOrderNotional: number;
  /** Hard cap per paper BUY — applies to all sizing modes (default ₹5,00,000). */
  paperMaxOrderValue: number;
  /** Minimum rupee turnover per paper BUY (default ₹25,000). Set 0 to disable. */
  paperMinOrderValue: number;
  /** Paper simulated product — delivery (CNC) recommended. */
  paperDefaultProduct: "CNC" | "MIS";
  maxOrderValue: number;
  maxDailyLoss: number;
  paperStartingBalance: number;
  simulateBrokerage: boolean;
  stopLossPercent: number;
  takeProfitPercent: number;
  autoStopLoss: boolean;
  autoTakeProfit: boolean;
  maxPositions: number;
  squareOffTime: string;
  notifyOrders: boolean;
  /** One email per strategy scan with all trades (recommended). */
  notifyEmailDigest: boolean;
  /** SKIPPED / failed paper orders — off by default (very noisy). */
  notifySkipped: boolean;
  /** Stop-loss / take-profit exit emails. */
  notifyRiskExits: boolean;
  notifySignals: boolean;
  notifyPnl: boolean;
  /** Minutes before same symbol can be bought after a sell (default 4h). */
  rebuyCooldownMinutes: number;
  /** Max complete buy→sell cycles per symbol per day. */
  maxRoundTripsPerSymbolPerDay: number;
  /** Block buying a symbol again on the same day after any sell. */
  noSameDayRebuyAfterSell: boolean;
  /** Minimum minutes to hold before a strategy SELL (risk exits ignore this). */
  minHoldMinutesBeforeSell: number;
  /** When true, strategy SELL signals exit paper positions after min-hold (buys run first each scan). */
  enableStrategySellSignals: boolean;
  /** Min strategy SELL signals on a symbol before strategy exit (weak single signals hold for trailing). */
  strategySellMinSignals: number;
  /** Paper position sizing: fixed rupee notional, % of balance, or ATR-risk. */
  positionSizingMode: "notional" | "portfolio_pct" | "atr_risk";
  /** % of paper balance per BUY when positionSizingMode is portfolio_pct. */
  positionPct: number;
  /** % of balance to risk per ATR when positionSizingMode is atr_risk. */
  atrRiskPct: number;
  /** ATR lookback for atr_risk sizing. */
  atrPeriod: number;
  /** Ratchet stop from position high-water mark. */
  autoTrailingStop: boolean;
  trailingStopPercent: number;
  /** Close positions held longer than N days (0 = off). */
  maxHoldDays: number;
  /** Close if held N days without min gain (0 = off). */
  noProgressDays: number;
  /** Min % gain required to avoid no-progress exit. */
  noProgressMinPct: number;
  /** Auto-pause strategy instances with rolling realized loss. */
  autoPauseEnabled: boolean;
  autoPauseLookbackDays: number;
  /** Pause when rolling loss exceeds this rupee amount. */
  autoPauseMaxLoss: number;
  /** Weight BUY signals by index ADX regime (Nifty ^NSEI). */
  enableRegimeWeighting: boolean;
  /** Only count SELL signals compatible with entry archetype. */
  enableEntryConnectedExits: boolean;
  regimeIndexSymbol: string;
  regimeAdxPeriod: number;
  regimeAdxThreshold: number;
  regimeAdxSlopeWindow: number;
  /** RSI overbought for SELL when entry was momentum/breakout. */
  momentumRsiOverbought: number;
  /** When true (default), live auto-trading uses paper automation fields. */
  liveMirrorPaperAutomation: boolean;
  liveEnableRegimeWeighting?: boolean;
  liveEnableEntryConnectedExits?: boolean;
  liveRegimeAdxThreshold?: number;
  liveMomentumRsiOverbought?: number;
  liveStopLossPercent?: number;
  liveTakeProfitPercent?: number;
  liveAutoStopLoss?: boolean;
  liveAutoTakeProfit?: boolean;
  liveMaxPositions?: number;
  liveEnableStrategySellSignals?: boolean;
  liveStrategySellMinSignals?: number;
  liveAutoTrailingStop?: boolean;
  liveTrailingStopPercent?: number;
  liveMinHoldMinutesBeforeSell?: number;
  liveMaxHoldDays?: number;
  liveNoProgressDays?: number;
  liveNoProgressMinPct?: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultExchange: "NSE",
  defaultProduct: "CNC",
  defaultOrderType: "MARKET",
  defaultQuantity: 1,
  paperOrderNotional: 100_000,
  paperMaxOrderValue: 500_000,
  paperMinOrderValue: 25_000,
  paperDefaultProduct: "CNC",
  maxOrderValue: 100_000,
  maxDailyLoss: 0,
  paperStartingBalance: 1000000,
  simulateBrokerage: false,
  stopLossPercent: 2,
  takeProfitPercent: 5,
  autoStopLoss: true,
  autoTakeProfit: false,
  maxPositions: 5,
  squareOffTime: "15:15",
  notifyOrders: true,
  notifyEmailDigest: true,
  notifySkipped: false,
  notifyRiskExits: true,
  notifySignals: false,
  notifyPnl: false,
  rebuyCooldownMinutes: 240,
  maxRoundTripsPerSymbolPerDay: 1,
  noSameDayRebuyAfterSell: true,
  minHoldMinutesBeforeSell: 60,
  enableStrategySellSignals: true,
  strategySellMinSignals: 2,
  positionSizingMode: "portfolio_pct",
  positionPct: 10,
  atrRiskPct: 1,
  atrPeriod: 14,
  autoTrailingStop: true,
  trailingStopPercent: 2,
  maxHoldDays: 10,
  noProgressDays: 5,
  noProgressMinPct: 0.5,
  autoPauseEnabled: false,
  autoPauseLookbackDays: 14,
  autoPauseMaxLoss: 5000,
  enableRegimeWeighting: true,
  enableEntryConnectedExits: true,
  regimeIndexSymbol: "^NSEI",
  regimeAdxPeriod: 14,
  regimeAdxThreshold: 23,
  regimeAdxSlopeWindow: 5,
  momentumRsiOverbought: 85,
  liveMirrorPaperAutomation: true,
};

export async function getSettings(): Promise<AppSettings> {
  try {
    const ref = doc(db, "users", getUserId(), "data", "settings");
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return normalizeAppSettings({
        ...DEFAULT_SETTINGS,
        ...snap.data(),
      } as AppSettings);
    }
  } catch (e) {
    console.error("Error loading settings:", e);
  }
  return normalizeAppSettings(DEFAULT_SETTINGS);
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const ref = doc(db, "users", getUserId(), "data", "settings");
  await setDoc(ref, { ...settings, updatedAt: serverTimestamp() }, { merge: true });
}

// ==================== STRATEGIES ====================

export interface ActiveStrategy {
  id: string;
  name: string;
  symbol: string;
  exchange: string;
  timeframe: string;
  mode: "paper" | "live";
  params: Record<string, number>;
  status: "running" | "paused" | "stopped";
  createdAt: string;
  signals: number;
  pnl: number;
  lastRunAt?: string;
  lastSignalReason?: string;
  /** Multi-symbol universe — scans all symbols on one instance. */
  symbols?: string[];
  universe?: "nifty50" | "banknifty" | "top100" | "custom";
  /** Keep top N BUY signals by confidence per universe scan (0 = all). */
  universeTopN?: number;
}

export async function getActiveStrategies(): Promise<ActiveStrategy[]> {
  try {
    const ref = doc(db, "users", getUserId(), "data", "strategies");
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data().items ?? [];
    }
  } catch (e) {
    console.error("Error loading strategies:", e);
  }
  return [];
}

export async function saveActiveStrategies(strategies: ActiveStrategy[]): Promise<void> {
  try {
    const ref = doc(db, "users", getUserId(), "data", "strategies");
    await setDoc(ref, { items: strategies, updatedAt: serverTimestamp() });
  } catch (e) {
    console.error("Error saving strategies:", e);
  }
}

// ==================== ZERODHA ACCOUNTS ====================

export interface ZerodhaAccount {
  kiteUserId: string;
  userName: string;
  email: string;
  broker: string;
  connectedAt: string;
  label?: string;
}

export async function getZerodhaAccounts(): Promise<ZerodhaAccount[]> {
  try {
    const ref = collection(db, "users", getUserId(), "zerodha_accounts");
    const snap = await getDocs(ref);
    return snap.docs.map((d) => d.data() as ZerodhaAccount);
  } catch (e) {
    console.error("Error loading Zerodha accounts:", e);
    return [];
  }
}

export async function saveZerodhaAccount(account: ZerodhaAccount): Promise<void> {
  try {
    const ref = doc(db, "users", getUserId(), "zerodha_accounts", account.kiteUserId);
    await setDoc(ref, { ...account, updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) {
    console.error("Error saving Zerodha account:", e);
  }
}

export async function removeZerodhaAccount(kiteUserId: string): Promise<void> {
  try {
    const ref = doc(db, "users", getUserId(), "zerodha_accounts", kiteUserId);
    await deleteDoc(ref);
  } catch (e) {
    console.error("Error removing Zerodha account:", e);
  }
}

export async function updateZerodhaAccountLabel(kiteUserId: string, label: string): Promise<void> {
  try {
    const ref = doc(db, "users", getUserId(), "zerodha_accounts", kiteUserId);
    await updateDoc(ref, { label, updatedAt: serverTimestamp() });
  } catch (e) {
    console.error("Error updating account label:", e);
  }
}

// ==================== ORDER HISTORY ====================

export interface OrderRecord {
  id: string;
  time: string;
  symbol: string;
  exchange: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  orderType: string;
  product: string;
  mode: "PAPER" | "LIVE";
  status: string;
  orderId?: string;
  date: string;
  strategyId?: string;
  strategyName?: string;
  reason?: string;
}

export async function saveOrder(order: OrderRecord): Promise<void> {
  try {
    const ref = doc(db, "users", getUserId(), "orders", order.id);
    await setDoc(ref, { ...order, createdAt: serverTimestamp() });
  } catch (e) {
    console.error("Error saving order:", e);
  }
}

export async function getOrders(maxCount = 100): Promise<OrderRecord[]> {
  try {
    const ref = collection(db, "users", getUserId(), "orders");
    const q = query(ref, orderBy("createdAt", "desc"), limit(maxCount));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as OrderRecord);
  } catch (e) {
    console.error("Error loading orders:", e);
    return [];
  }
}

export { db, app };
