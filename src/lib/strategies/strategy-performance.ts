import type { PaperTrade } from "@/lib/firebase";

export interface EnrichedPaperTrade extends PaperTrade {
  /** Resolved name for display (from trade or opening BUY lot). */
  displayStrategyName: string;
  displayStrategyId?: string;
}

export interface StrategyPerformanceRow {
  strategyId?: string;
  strategyName: string;
  trades: number;
  buys: number;
  sells: number;
  realizedPnl: number;
  closedRounds: number;
  wins: number;
  losses: number;
}

type Lot = {
  qty: number;
  avgPrice: number;
  strategyName: string;
  strategyId?: string;
};

function positionKey(symbol: string, exchange: string): string {
  return `${symbol.trim().toUpperCase()}:${(exchange || "NSE").trim().toUpperCase()}`;
}

function tradeSortKey(t: PaperTrade): string {
  const date = t.date ?? "";
  return `${date}T${t.time}`;
}

/** Attach strategy labels to sells that predate strategyName on SELL rows. */
export function enrichTradesWithStrategy(
  trades: PaperTrade[]
): EnrichedPaperTrade[] {
  const chronological = [...trades].sort((a, b) =>
    tradeSortKey(a).localeCompare(tradeSortKey(b))
  );
  const lots = new Map<string, Lot[]>();
  const enrichedById = new Map<string, EnrichedPaperTrade>();

  for (const t of chronological) {
    const key = positionKey(t.symbol, t.exchange);
    const name =
      t.strategyName?.trim() ||
      (t.strategyId ? `Strategy ${t.strategyId.slice(0, 8)}` : "");
    const id = t.strategyId;

    if (t.side === "BUY") {
      const list = lots.get(key) ?? [];
      list.push({
        qty: t.qty,
        avgPrice: t.price,
        strategyName: name || "Manual",
        strategyId: id,
      });
      lots.set(key, list);
      enrichedById.set(t.id, {
        ...t,
        displayStrategyName: name || "Manual",
        displayStrategyId: id,
      });
    } else {
      let sellQty = t.qty;
      let inheritedName = name;
      let inheritedId = id;
      const list = lots.get(key) ?? [];

      while (sellQty > 0 && list.length > 0) {
        const lot = list[0];
        if (!inheritedName && lot.strategyName !== "Manual") {
          inheritedName = lot.strategyName;
          inheritedId = lot.strategyId;
        }
        const take = Math.min(sellQty, lot.qty);
        lot.qty -= take;
        sellQty -= take;
        if (lot.qty <= 0) list.shift();
      }
      lots.set(key, list);

      enrichedById.set(t.id, {
        ...t,
        displayStrategyName: inheritedName || name || "Manual",
        displayStrategyId: inheritedId ?? id,
        strategyName: t.strategyName ?? (inheritedName || undefined),
        strategyId: t.strategyId ?? inheritedId,
      });
    }
  }

  return trades.map((t) => {
    const e = enrichedById.get(t.id);
    if (e) return e;
    const name = t.strategyName?.trim() || "Manual";
    return {
      ...t,
      displayStrategyName: name,
      displayStrategyId: t.strategyId,
    };
  });
}

/** Realized P&L per strategy from closed round-trips (FIFO per symbol). */
export function computeStrategyPerformance(
  trades: PaperTrade[]
): StrategyPerformanceRow[] {
  const enriched = enrichTradesWithStrategy(trades);
  const chronological = [...enriched].sort((a, b) =>
    tradeSortKey(a).localeCompare(tradeSortKey(b))
  );

  const lots = new Map<string, Lot[]>();
  const stats = new Map<string, StrategyPerformanceRow>();

  function rowKey(name: string, id?: string): string {
    return id ? `id:${id}` : `name:${name}`;
  }

  function getRow(name: string, id?: string): StrategyPerformanceRow {
    const key = rowKey(name, id);
    let row = stats.get(key);
    if (!row) {
      row = {
        strategyId: id,
        strategyName: name,
        trades: 0,
        buys: 0,
        sells: 0,
        realizedPnl: 0,
        closedRounds: 0,
        wins: 0,
        losses: 0,
      };
      stats.set(key, row);
    }
    return row;
  }

  for (const t of chronological) {
    const stratName = t.displayStrategyName;
    const stratId = t.displayStrategyId;
    const row = getRow(stratName, stratId);
    row.trades += 1;

    const key = positionKey(t.symbol, t.exchange);

    if (t.side === "BUY") {
      row.buys += 1;
      const list = lots.get(key) ?? [];
      list.push({
        qty: t.qty,
        avgPrice: t.price,
        strategyName: stratName,
        strategyId: stratId,
      });
      lots.set(key, list);
    } else {
      row.sells += 1;
      let sellQty = t.qty;
      const list = lots.get(key) ?? [];

      while (sellQty > 0 && list.length > 0) {
        const lot = list[0];
        const take = Math.min(sellQty, lot.qty);
        const pnl = (t.price - lot.avgPrice) * take;
        const lotRow = getRow(lot.strategyName, lot.strategyId);
        lotRow.realizedPnl += pnl;
        lotRow.closedRounds += 1;
        if (pnl > 0) lotRow.wins += 1;
        else if (pnl < 0) lotRow.losses += 1;

        lot.qty -= take;
        sellQty -= take;
        if (lot.qty <= 0) list.shift();
      }
      lots.set(key, list);
    }
  }

  return [...stats.values()]
    .filter((r) => r.strategyName !== "Manual" || r.trades > 0)
    .sort((a, b) => b.realizedPnl - a.realizedPnl);
}
