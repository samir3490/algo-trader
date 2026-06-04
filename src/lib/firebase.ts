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

function getUserId(): string {
  if (_overrideUid) return _overrideUid;
  const auth = getAuth(app);
  return auth.currentUser?.uid || "default_user";
}

// ==================== PAPER TRADING ====================

export interface PaperTradingState {
  balance: number;
  holdings: PaperHolding[];
  trades: PaperTrade[];
  updatedAt?: any;
}

export interface PaperHolding {
  symbol: string;
  exchange: string;
  qty: number;
  avgPrice: number;
  ltp: number;
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
  strategyName?: string;
  reason?: string;
  product?: string;
  charges?: number;
  brokerage?: number;
  stt?: number;
  gst?: number;
  netPnl?: number;
  grossAmount?: number;
}

const INITIAL_BALANCE = 1000000;

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
        trades: data.trades ?? [],
        cloudUpdatedAtMs,
      };
    }
  } catch (e) {
    console.error("Error loading paper trading state:", e);
  }
  return { balance: INITIAL_BALANCE, holdings: [], trades: [] };
}

export async function savePaperTradingState(state: PaperTradingState): Promise<void> {
  try {
    const ref = doc(db, "users", getUserId(), "data", "paperTrading");
    await setDoc(ref, {
      balance: state.balance,
      holdings: state.holdings,
      trades: state.trades.slice(0, 500),
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.error("Error saving paper trading state:", e);
  }
}

export async function resetPaperTrading(): Promise<void> {
  try {
    const ref = doc(db, "users", getUserId(), "data", "paperTrading");
    await setDoc(ref, {
      balance: INITIAL_BALANCE,
      holdings: [],
      trades: [],
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.error("Error resetting paper trading:", e);
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
  /** Paper + strategy default quantity when not set on strategy card. */
  defaultQuantity: number;
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
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultExchange: "NSE",
  defaultProduct: "CNC",
  defaultOrderType: "MARKET",
  defaultQuantity: 1,
  paperDefaultProduct: "CNC",
  maxOrderValue: 100000,
  maxDailyLoss: 5000,
  paperStartingBalance: 1000000,
  simulateBrokerage: false,
  stopLossPercent: 2,
  takeProfitPercent: 5,
  autoStopLoss: true,
  autoTakeProfit: true,
  maxPositions: 10,
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
};

export async function getSettings(): Promise<AppSettings> {
  try {
    const ref = doc(db, "users", getUserId(), "data", "settings");
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return { ...DEFAULT_SETTINGS, ...snap.data() } as AppSettings;
    }
  } catch (e) {
    console.error("Error loading settings:", e);
  }
  return DEFAULT_SETTINGS;
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
