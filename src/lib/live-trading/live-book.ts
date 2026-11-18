import { KiteConnect } from "kiteconnect";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import {
  type LiveHoldingLike,
  type LivePositionLike,
} from "@/lib/live-trading/capital-limits";
import { listServerKiteTokens } from "@/lib/zerodha/server-token-store";
import { todayDateKeyIST } from "@/lib/portfolio/compute-portfolio";

export interface LiveBook {
  ok: boolean;
  message?: string;
  /** Broker positions (for order qty / display). */
  positions: LivePositionLike[];
  holdings: LiveHoldingLike[];
  /** Algo-only open symbols (independent of paper + non-algo holdings). */
  openSymbols: Set<string>;
  openCount: number;
  /** Algo-only deployed ₹ (independent of full broker book). */
  deployed: number;
  tradesToday: number;
  buyNotionalToday: number;
  kiteUserId?: string;
  apiKey?: string;
  accessToken?: string;
  kite?: InstanceType<typeof KiteConnect>;
}

function readAlgoQuota(data: Record<string, unknown> | undefined): {
  openSymbols: Set<string>;
  deployed: number;
  tradesToday: number;
  buyNotionalToday: number;
} {
  const dateIST = todayDateKeyIST();
  const sameDay = data?.algoStatsDateIST === dateIST;
  const openSymbols = new Set<string>(
    (Array.isArray(data?.algoOpenSymbols) ? data!.algoOpenSymbols : [])
      .map((s) => String(s).toUpperCase())
      .filter(Boolean)
  );
  return {
    openSymbols,
    deployed: Math.max(0, Number(data?.algoDeployedCapital ?? 0) || 0),
    tradesToday: sameDay ? Number(data?.algoTradesToday ?? 0) || 0 : 0,
    buyNotionalToday: sameDay
      ? Number(data?.algoBuyNotionalToday ?? 0) || 0
      : 0,
  };
}

/** Load Zerodha session + algo-only live quotas (not paper, not full portfolio). */
export async function loadLiveBook(
  db: Firestore,
  appUserId: string
): Promise<LiveBook> {
  const tokens = await listServerKiteTokens(db, appUserId);
  const token = tokens[0];
  if (!token) {
    return {
      ok: false,
      message: "No server Kite token — reconnect Zerodha in Settings",
      positions: [],
      holdings: [],
      openSymbols: new Set(),
      openCount: 0,
      deployed: 0,
      tradesToday: 0,
      buyNotionalToday: 0,
    };
  }

  const kite = new KiteConnect({ api_key: token.apiKey });
  kite.setAccessToken(token.accessToken);

  const positions: LivePositionLike[] = [];
  const holdings: LiveHoldingLike[] = [];

  try {
    const posResp = await kite.getPositions();
    const net = (posResp as { net?: any[] })?.net ?? [];
    for (const p of net) {
      const qty = Number(p.quantity ?? 0);
      if (qty <= 0) continue;
      positions.push({
        qty,
        avgPrice: Number(p.average_price ?? p.avg_price ?? 0),
      });
    }
  } catch {
    /* holdings still useful */
  }

  try {
    const list = await kite.getHoldings();
    const rows = Array.isArray(list) ? list : [];
    for (const h of rows) {
      const qty = Number(
        (h as { quantity?: number }).quantity ??
          (h as { qty?: number }).qty ??
          0
      );
      if (qty <= 0) continue;
      holdings.push({
        qty,
        quantity: qty,
        avgPrice: Number((h as { average_price?: number }).average_price ?? 0),
      });
    }
  } catch {
    /* ignore */
  }

  const quotaSnap = await db.doc(`users/${appUserId}/data/liveTrading`).get();
  const quota = readAlgoQuota(
    quotaSnap.exists ? (quotaSnap.data() as Record<string, unknown>) : undefined
  );

  return {
    ok: true,
    positions,
    holdings,
    openSymbols: quota.openSymbols,
    openCount: quota.openSymbols.size,
    deployed: quota.deployed,
    tradesToday: quota.tradesToday,
    buyNotionalToday: quota.buyNotionalToday,
    kiteUserId: token.kiteUserId,
    apiKey: token.apiKey,
    accessToken: token.accessToken,
    kite,
  };
}

/**
 * Positions/holdings stand-ins so capital gates use algo-only deployed ₹,
 * not the full broker portfolio (paper and live stay independent).
 */
export function algoCapitalBook(deployed: number): {
  positions: LivePositionLike[];
  holdings: LiveHoldingLike[];
} {
  if (deployed <= 0) return { positions: [], holdings: [] };
  return {
    positions: [{ qty: 1, avgPrice: deployed }],
    holdings: [],
  };
}

/** Persist live algo trade counters separately from paper. */
export async function recordLiveAlgoFill(
  db: Firestore,
  appUserId: string,
  fill: {
    orderId?: string;
    side: "BUY" | "SELL";
    symbol: string;
    qty: number;
    price: number;
    kiteUserId?: string;
  }
): Promise<void> {
  const dateIST = todayDateKeyIST();
  const ref = db.doc(`users/${appUserId}/data/liveTrading`);
  const snap = await ref.get();
  const prev = (snap.exists ? snap.data() : {}) as Record<string, unknown>;
  const quota = readAlgoQuota(prev);
  const notional = Math.round(fill.qty * fill.price * 100) / 100;

  const openSymbols = new Set(quota.openSymbols);
  const sym = fill.symbol.toUpperCase();
  let deployed = quota.deployed;

  if (fill.side === "BUY") {
    openSymbols.add(sym);
    deployed += notional;
  } else {
    openSymbols.delete(sym);
    deployed = Math.max(0, deployed - notional);
  }

  await ref.set(
    {
      lastAlgoOrderAt: FieldValue.serverTimestamp(),
      lastAlgoOrder: {
        orderId: fill.orderId,
        side: fill.side,
        symbol: sym,
        qty: fill.qty,
        price: fill.price,
        kiteUserId: fill.kiteUserId,
      },
      algoStatsDateIST: dateIST,
      algoTradesToday: quota.tradesToday + 1,
      algoBuyNotionalToday:
        fill.side === "BUY"
          ? quota.buyNotionalToday + notional
          : quota.buyNotionalToday,
      algoSellNotionalToday:
        fill.side === "SELL"
          ? Number(prev.algoSellNotionalToday ?? 0) + notional
          : Number(prev.algoSellNotionalToday ?? 0) || 0,
      algoOpenSymbols: [...openSymbols],
      algoOpenCount: openSymbols.size,
      algoDeployedCapital: Math.round(deployed * 100) / 100,
    },
    { merge: true }
  );
}
