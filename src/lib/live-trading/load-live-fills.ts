import type { OrderRecord, PaperTrade } from "@/lib/firebase";
import { getOrders } from "@/lib/firebase";
import { attachFifoNetPnl } from "@/lib/portfolio/trade-period";
import {
  inferLiveStrategyName,
  liveOrdersToPaperTrades,
} from "@/lib/live-trading/live-order-record";

/** Kite IST timestamps often omit offset — pin +05:30. */
function normalizeKiteTimestamp(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/);
  if (m) {
    const time = m[2].length === 5 ? `${m[2]}:00` : m[2];
    return `${m[1]}T${time}+05:30`;
  }
  return s;
}

export function isLiveOrderRecord(o: {
  mode?: string;
  id?: string;
  status?: string;
}): boolean {
  const mode = String(o.mode || "").trim().toUpperCase();
  if (mode === "LIVE") return true;
  if (mode === "PAPER") return false;
  if (o.id?.startsWith("live-")) return true;
  const status = String(o.status || "").toUpperCase();
  if (status.includes("LIVE")) return true;
  return false;
}

export interface LiveBrokerSnapshot {
  connected: boolean;
  accountIds: string[];
  available: number;
  dayPnl: number;
  holdingsPnl: number;
  openPositions: number;
  holdingsCount: number;
}

export interface LiveFillsBundle {
  /** Closed/open live fills as PaperTrade rows (FIFO netPnl attached). */
  trades: PaperTrade[];
  firestoreLiveCount: number;
  kiteOrderCount: number;
  broker: LiveBrokerSnapshot;
}

type RawLiveRow = {
  orderId?: string;
  time: string;
  symbol: string;
  exchange?: string;
  side: string;
  qty: number;
  price: number;
  status?: string;
  strategyName?: string;
  reason?: string;
  product?: string;
};

function netPositions(raw: unknown): any[] {
  if (!raw || typeof raw !== "object") return [];
  const p = raw as { net?: unknown; day?: unknown };
  if (Array.isArray(p.net)) return p.net;
  if (Array.isArray(raw)) return raw as any[];
  return [];
}

function holdingsList(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && Array.isArray((raw as { holdings?: unknown }).holdings)) {
    return (raw as { holdings: any[] }).holdings;
  }
  return [];
}

async function authHeaders(
  getIdToken?: () => Promise<string | null>
): Promise<HeadersInit> {
  if (!getIdToken) return {};
  try {
    const token = await getIdToken();
    if (token) return { Authorization: `Bearer ${token}` };
  } catch {
    /* ignore */
  }
  return {};
}

/**
 * Load LIVE fills the same way Live Trading does:
 * today's Kite day-book + Firestore LIVE history, merged by order id.
 */
export async function loadLiveFillsClient(
  maxFirestore = 1000,
  options?: { getIdToken?: () => Promise<string | null> }
): Promise<LiveFillsBundle> {
  const headers = await authHeaders(options?.getIdToken);
  const [firestoreOrders, accountsRes] = await Promise.all([
    getOrders(maxFirestore).catch(() => [] as OrderRecord[]),
    fetch("/api/zerodha/accounts", { headers }).catch(() => null),
  ]);

  const liveFs = firestoreOrders.filter(isLiveOrderRecord);
  const byOrderId = new Map(
    liveFs
      .filter((o) => o.orderId)
      .map((o) => [String(o.orderId), o] as const)
  );
  const strategyBySymbol = new Map<string, string>();
  for (const o of [...liveFs].sort((a, b) =>
    String(b.time || b.date || "").localeCompare(String(a.time || a.date || ""))
  )) {
    const sym = String(o.symbol || "").toUpperCase();
    const name = inferLiveStrategyName(o.strategyName, o.reason);
    if (sym && name && name !== "Manual" && !strategyBySymbol.has(sym)) {
      strategyBySymbol.set(sym, name);
    }
  }

  const accountsJson = accountsRes
    ? await accountsRes.json().catch(() => ({}))
    : {};
  const accounts = (
    (accountsJson.accounts || []) as Array<{
      kiteUserId?: string;
      connected?: boolean;
    }>
  ).filter((a) => a.kiteUserId && a.connected !== false);

  const kiteRows: RawLiveRow[] = [];
  let available = 0;
  let dayPnl = 0;
  let holdingsPnl = 0;
  let openPositions = 0;
  let holdingsCount = 0;
  const accountIds: string[] = [];

  await Promise.all(
    accounts.map(async (account) => {
      const id = String(account.kiteUserId);
      accountIds.push(id);
      const q = `accountId=${encodeURIComponent(id)}`;
      const [ordersRes, marginsRes, positionsRes, holdingsRes] =
        await Promise.all([
          fetch(`/api/zerodha/orders?${q}`, { headers }).catch(() => null),
          fetch(`/api/zerodha/margins?${q}`, { headers }).catch(() => null),
          fetch(`/api/zerodha/positions?${q}`, { headers }).catch(() => null),
          fetch(`/api/zerodha/holdings?${q}`, { headers }).catch(() => null),
        ]);

      if (ordersRes?.ok) {
        const data = await ordersRes.json().catch(() => ({}));
        for (const o of data.orders || []) {
          const orderId = String(o.order_id || "");
          const fs = orderId ? byOrderId.get(orderId) : undefined;
          const tag = String(o.tag || "").trim();
          const symbol = String(o.tradingsymbol || "").toUpperCase();
          kiteRows.push({
            orderId,
            time: normalizeKiteTimestamp(
              String(o.order_timestamp || o.exchange_timestamp || "")
            ),
            symbol,
            exchange: o.exchange || fs?.exchange || "NSE",
            side: o.transaction_type,
            qty: Number(o.filled_quantity || o.quantity) || 0,
            price: Number(o.average_price || o.price) || 0,
            status: o.status,
            strategyName: inferLiveStrategyName(
              fs?.strategyName ||
                (tag && tag.toLowerCase() !== "manual" ? tag : undefined) ||
                strategyBySymbol.get(symbol),
              fs?.reason
            ),
            reason: fs?.reason,
            product: o.product || fs?.product || "CNC",
          });
        }
      }

      if (marginsRes?.ok) {
        const margins = await marginsRes.json().catch(() => ({}));
        available +=
          Number(
            margins.available?.cash ?? margins.available?.live_balance ?? 0
          ) || 0;
      }

      if (positionsRes?.ok) {
        const positionsJson = await positionsRes.json().catch(() => ({}));
        const net = netPositions(positionsJson.positions ?? positionsJson);
        for (const p of net) {
          dayPnl += Number(p.pnl || 0);
          if (Number(p.quantity || p.qty || 0) !== 0) openPositions += 1;
        }
      }

      if (holdingsRes?.ok) {
        const holdingsJson = await holdingsRes.json().catch(() => ({}));
        const list = holdingsList(holdingsJson.holdings ?? holdingsJson);
        holdingsCount += list.length;
        for (const h of list) holdingsPnl += Number(h.pnl || 0);
      }
    })
  );

  const kiteIds = new Set(kiteRows.map((o) => o.orderId).filter(Boolean));
  const historyRows: RawLiveRow[] = liveFs
    .filter((o) => !o.orderId || !kiteIds.has(String(o.orderId)))
    .map((o) => ({
      orderId: o.orderId || o.id,
      time: normalizeKiteTimestamp(o.time || o.date || ""),
      symbol: o.symbol,
      exchange: o.exchange || "NSE",
      side: o.side,
      qty: o.qty,
      price: o.price,
      status: o.status || "COMPLETE",
      strategyName: inferLiveStrategyName(o.strategyName, o.reason),
      reason: o.reason,
      product: o.product || "CNC",
    }));

  const merged = [...kiteRows, ...historyRows];
  const trades = attachFifoNetPnl(liveOrdersToPaperTrades(merged));

  return {
    trades,
    firestoreLiveCount: liveFs.length,
    kiteOrderCount: kiteRows.length,
    broker: {
      connected: accountIds.length > 0,
      accountIds,
      available,
      dayPnl,
      holdingsPnl,
      openPositions,
      holdingsCount,
    },
  };
}
