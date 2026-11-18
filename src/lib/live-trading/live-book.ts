import { KiteConnect } from "kiteconnect";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import {
  computeLiveDeployedCapital,
  type LiveHoldingLike,
  type LivePositionLike,
} from "@/lib/live-trading/capital-limits";
import { listServerKiteTokens } from "@/lib/zerodha/server-token-store";
import { todayDateKeyIST } from "@/lib/portfolio/compute-portfolio";

export interface LiveBook {
  ok: boolean;
  message?: string;
  positions: LivePositionLike[];
  holdings: LiveHoldingLike[];
  /** Distinct symbols with a long live position or holding. */
  openSymbols: Set<string>;
  openCount: number;
  deployed: number;
  kiteUserId?: string;
  kite?: InstanceType<typeof KiteConnect>;
}

/** Load live positions/holdings from Zerodha for algo capital + slot accounting. */
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
    };
  }

  const kite = new KiteConnect({ api_key: token.apiKey });
  kite.setAccessToken(token.accessToken);

  const positions: LivePositionLike[] = [];
  const holdings: LiveHoldingLike[] = [];
  const openSymbols = new Set<string>();

  try {
    const posResp = await kite.getPositions();
    const net = (posResp as { net?: any[] })?.net ?? [];
    for (const p of net) {
      const qty = Number(p.quantity ?? 0);
      if (qty <= 0) continue;
      const sym = String(p.tradingsymbol || "").toUpperCase();
      if (!sym) continue;
      positions.push({
        qty,
        avgPrice: Number(p.average_price ?? p.avg_price ?? 0),
      });
      openSymbols.add(sym);
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
      const sym = String(
        (h as { tradingsymbol?: string }).tradingsymbol || ""
      ).toUpperCase();
      if (!sym) continue;
      const invested = Number((h as { average_price?: number }).average_price)
        ? qty * Number((h as { average_price?: number }).average_price)
        : undefined;
      holdings.push({
        qty,
        quantity: qty,
        avgPrice: Number((h as { average_price?: number }).average_price ?? 0),
        invested:
          typeof (h as { close_price?: number }).close_price === "number"
            ? undefined
            : invested,
      });
      openSymbols.add(sym);
    }
  } catch {
    /* ignore */
  }

  const deployed = computeLiveDeployedCapital(positions, holdings);
  return {
    ok: true,
    positions,
    holdings,
    openSymbols,
    openCount: openSymbols.size,
    deployed,
    kiteUserId: token.kiteUserId,
    kite,
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
  const prev = snap.exists ? snap.data() ?? {} : {};
  const sameDay = prev.algoStatsDateIST === dateIST;
  const tradesToday = sameDay ? Number(prev.algoTradesToday ?? 0) : 0;
  const buyNotionalToday = sameDay
    ? Number(prev.algoBuyNotionalToday ?? 0)
    : 0;
  const sellNotionalToday = sameDay
    ? Number(prev.algoSellNotionalToday ?? 0)
    : 0;
  const notional = Math.round(fill.qty * fill.price * 100) / 100;

  const openSymbols: string[] = Array.isArray(prev.algoOpenSymbols)
    ? [...prev.algoOpenSymbols]
    : [];
  const sym = fill.symbol.toUpperCase();
  if (fill.side === "BUY") {
    if (!openSymbols.includes(sym)) openSymbols.push(sym);
  } else {
    const idx = openSymbols.indexOf(sym);
    if (idx >= 0) openSymbols.splice(idx, 1);
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
      algoTradesToday: tradesToday + 1,
      algoBuyNotionalToday:
        fill.side === "BUY" ? buyNotionalToday + notional : buyNotionalToday,
      algoSellNotionalToday:
        fill.side === "SELL"
          ? sellNotionalToday + notional
          : sellNotionalToday,
      algoOpenSymbols: openSymbols,
      algoOpenCount: openSymbols.length,
    },
    { merge: true }
  );
}
