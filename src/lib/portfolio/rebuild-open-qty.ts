import type { OrderRecord, PaperTrade, PaperTradingState } from "@/lib/firebase";
import { tradeExecutedAtMs } from "@/lib/paper-trades/normalize";
import type { PaperPosition } from "./types";
import { withSyncedHoldings } from "./position-manager";

function symKey(symbol: string, exchange: string): string {
  return `${symbol.trim().toUpperCase()}:${(exchange || "NSE").trim().toUpperCase()}`;
}

function istDateFromMs(ms: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

interface Fill {
  id: string;
  symbol: string;
  exchange: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  ms: number;
  date: string;
  ownerStrategyId?: string;
  ownerStrategyName?: string;
  reason?: string;
}

function exactFillKey(f: Fill): string {
  return [f.symbol, f.exchange, f.side, f.date, String(f.qty), String(f.price)].join(
    "|"
  );
}

function collectFills(trades: PaperTrade[], orders: OrderRecord[]): Fill[] {
  const byId = new Map<string, Fill>();
  const byExact = new Map<string, Fill>();

  const push = (f: Fill) => {
    if (!f.id || f.qty <= 0 || !(f.price > 0)) return;
    if (byId.has(f.id)) return;
    const fp = exactFillKey(f);
    if (byExact.has(fp)) return;
    byId.set(f.id, f);
    byExact.set(fp, f);
  };

  for (const t of trades) {
    const ms = tradeExecutedAtMs(t);
    push({
      id: t.id,
      symbol: t.symbol.trim().toUpperCase(),
      exchange: (t.exchange || "NSE").trim().toUpperCase(),
      side: t.side,
      qty: Math.floor(Number(t.qty) || 0),
      price: Number(t.price) || 0,
      ms,
      date:
        t.date ||
        istDateFromMs(ms) ||
        new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
      ownerStrategyId: t.ownerStrategyId ?? t.strategyId,
      ownerStrategyName: t.strategyName,
      reason: t.reason,
    });
  }

  for (const o of orders) {
    if (o.mode && o.mode !== "PAPER") continue;
    const status = (o.status || "EXECUTED").toUpperCase();
    if (
      status &&
      status !== "EXECUTED" &&
      status !== "COMPLETE" &&
      status !== "FILLED"
    ) {
      continue;
    }
    const ms = Date.parse(o.time) || 0;
    push({
      id: o.id,
      symbol: o.symbol.trim().toUpperCase(),
      exchange: (o.exchange || "NSE").trim().toUpperCase(),
      side: o.side,
      qty: Math.floor(Number(o.qty) || 0),
      price: Number(o.price) || 0,
      ms,
      date:
        o.date ||
        istDateFromMs(ms) ||
        new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
      ownerStrategyId: o.strategyId,
      ownerStrategyName: o.strategyName,
      reason: o.reason,
    });
  }

  return [...byId.values()].sort(
    (a, b) => a.ms - b.ms || a.id.localeCompare(b.id)
  );
}

interface NetLot {
  qty: number;
  avgPrice: number;
  entryMs: number;
  ownerStrategyId: string;
  ownerStrategyName?: string;
  reason?: string;
  buyCount: number;
  sellCount: number;
}

function netOpenBySymbol(fills: Fill[]): Map<string, NetLot> {
  type Lot = {
    qty: number;
    price: number;
    ms: number;
    ownerStrategyId?: string;
    ownerStrategyName?: string;
    reason?: string;
  };
  const lotsByKey = new Map<string, Lot[]>();
  const buyCountByKey = new Map<string, number>();
  const sellCountByKey = new Map<string, number>();

  for (const f of fills) {
    const key = symKey(f.symbol, f.exchange);
    if (f.side === "BUY") {
      buyCountByKey.set(key, (buyCountByKey.get(key) ?? 0) + 1);
      const lots = lotsByKey.get(key) ?? [];
      lots.push({
        qty: f.qty,
        price: f.price,
        ms: f.ms || 0,
        ownerStrategyId: f.ownerStrategyId,
        ownerStrategyName: f.ownerStrategyName,
        reason: f.reason,
      });
      lotsByKey.set(key, lots);
      continue;
    }
    sellCountByKey.set(key, (sellCountByKey.get(key) ?? 0) + 1);
    let remaining = f.qty;
    const lots = lotsByKey.get(key) ?? [];
    for (const lot of lots) {
      if (remaining <= 0) break;
      const take = Math.min(lot.qty, remaining);
      lot.qty -= take;
      remaining -= take;
    }
    lotsByKey.set(key, lots.filter((l) => l.qty > 0));
  }

  const out = new Map<string, NetLot>();
  for (const [key, lots] of lotsByKey) {
    const qty = lots.reduce((s, l) => s + l.qty, 0);
    const buyCount = buyCountByKey.get(key) ?? 0;
    const sellCount = sellCountByKey.get(key) ?? 0;
    if (qty <= 0) {
      out.set(key, {
        qty: 0,
        avgPrice: 0,
        entryMs: 0,
        ownerStrategyId: "manual",
        buyCount,
        sellCount,
      });
      continue;
    }
    const cost = lots.reduce((s, l) => s + l.qty * l.price, 0);
    const entryMsValues = lots.map((l) => l.ms).filter((ms) => ms > 0);
    out.set(key, {
      qty,
      avgPrice: Math.round((cost / qty) * 100) / 100,
      entryMs: entryMsValues.length ? Math.min(...entryMsValues) : Date.now(),
      ownerStrategyId: lots[0].ownerStrategyId ?? "manual",
      ownerStrategyName: lots[0].ownerStrategyName,
      reason: lots[0].reason,
      buyCount,
      sellCount,
    });
  }

  for (const [key, sellCount] of sellCountByKey) {
    if (!out.has(key)) {
      out.set(key, {
        qty: 0,
        avgPrice: 0,
        entryMs: 0,
        ownerStrategyId: "manual",
        buyCount: buyCountByKey.get(key) ?? 0,
        sellCount,
      });
    }
  }

  return out;
}

export function paperHoldingsSignature(state: PaperTradingState): string {
  return (state.holdings ?? [])
    .map((h) => `${h.symbol}:${h.exchange}:${h.qty}:${h.avgPrice}`)
    .sort()
    .join("|");
}

/**
 * Rebuild open qty/avg from unmatched BUY−SELL fills.
 * Increases when add-on buys were recorded but not applied to the lot.
 * Decreases only when a SELL fill exists (never close a name with no buy history).
 */
export function rebuildOpenQtyFromFills(
  state: PaperTradingState,
  orders: OrderRecord[] = []
): PaperTradingState {
  const fills = collectFills(state.trades ?? [], orders);
  if (fills.length === 0) return state;

  const nets = netOpenBySymbol(fills);
  let positions = [...(state.positions ?? [])];
  let changed = false;

  const openIdxByKey = new Map<string, number[]>();
  positions.forEach((p, i) => {
    if (p.state !== "OPEN" && p.state !== "PARTIAL_EXIT") return;
    const key = symKey(p.symbol, p.exchange);
    const arr = openIdxByKey.get(key) ?? [];
    arr.push(i);
    openIdxByKey.set(key, arr);
  });

  const keys = new Set([...nets.keys(), ...openIdxByKey.keys()]);

  for (const key of keys) {
    const net = nets.get(key);
    const idxs = openIdxByKey.get(key) ?? [];
    const currentQty = idxs.reduce((s, i) => s + (positions[i].quantity ?? 0), 0);
    const buyCount = net?.buyCount ?? 0;
    const sellCount = net?.sellCount ?? 0;
    const expectedQty = net?.qty ?? 0;

    if (!net || buyCount === 0) continue;
    if (expectedQty === currentQty) continue;

    const canIncrease = expectedQty > currentQty;
    const canDecrease =
      expectedQty < currentQty &&
      sellCount > 0 &&
      (expectedQty > 0 || buyCount > 0);
    if (!canIncrease && !canDecrease) continue;

    if (expectedQty <= 0) {
      const now = new Date().toISOString();
      for (const i of idxs) {
        positions[i] = {
          ...positions[i],
          quantity: 0,
          state: "CLOSED",
          exitTime: positions[i].exitTime ?? now,
          exitReason: positions[i].exitReason ?? "OWNER_STRATEGY_EXIT",
        };
      }
      changed = true;
      continue;
    }

    if (idxs.length === 0) {
      const [symbol, exchange] = key.split(":");
      const created: PaperPosition = {
        id: `pos-rebuild-${symbol}-${exchange}`,
        symbol,
        exchange,
        quantity: expectedQty,
        entryPrice: net.avgPrice,
        ltp: net.avgPrice,
        ownerStrategyId: net.ownerStrategyId,
        ownerStrategyName: net.ownerStrategyName,
        state: "OPEN",
        entryTime: net.entryMs
          ? new Date(net.entryMs).toISOString()
          : new Date().toISOString(),
        signalReason: net.reason,
      };
      positions.push(created);
      changed = true;
      continue;
    }

    positions[idxs[0]] = {
      ...positions[idxs[0]],
      quantity: expectedQty,
      entryPrice: net.avgPrice,
    };
    if (idxs.length > 1) {
      const now = new Date().toISOString();
      for (const i of idxs.slice(1)) {
        positions[i] = {
          ...positions[i],
          quantity: 0,
          state: "CLOSED",
          exitTime: now,
          exitReason: "DUPLICATE_EXPOSURE",
        };
      }
    }
    changed = true;
  }

  if (!changed) return state;
  return withSyncedHoldings({ ...state, positions });
}
