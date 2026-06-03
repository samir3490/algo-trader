import type { PaperTrade } from "@/lib/firebase";
import {
  formatTradeDateTime,
  isStrategyTrade,
  tradeExecutedAtMs,
} from "@/lib/paper-trades/normalize";

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

export interface StrategyTradeEvent {
  tradeId: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  total: number;
  executedAtMs: number;
  dateTimeLabel: string;
  reason?: string;
  /** Set on SELL — profit/loss for this exit (FIFO). */
  realizedPnl?: number;
  matchedBuyPrice?: number;
}

export interface StrategySymbolDetail {
  symbol: string;
  exchange: string;
  events: StrategyTradeEvent[];
  realizedPnl: number;
  openQty: number;
  openAvgCost: number;
  unrealizedPnl: number;
  status: "open" | "closed";
}

export interface StrategyDetailBundle {
  key: string;
  strategyId?: string;
  strategyName: string;
  summary: StrategyPerformanceRow;
  symbols: StrategySymbolDetail[];
}

export interface HoldingForPnl {
  symbol: string;
  exchange: string;
  qty: number;
  avgPrice: number;
  ltp: number;
}

export function strategyDetailKey(name: string, id?: string): string {
  return id ? `id:${id}` : `name:${name}`;
}

function matchesStrategy(
  t: EnrichedPaperTrade,
  name: string,
  id?: string
): boolean {
  if (id && t.displayStrategyId) return t.displayStrategyId === id;
  return t.displayStrategyName === name;
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

function tradeSortKey(t: PaperTrade): number {
  return tradeExecutedAtMs(t);
}

/** Attach strategy labels to sells that predate strategyName on SELL rows. */
export function enrichTradesWithStrategy(
  trades: PaperTrade[]
): EnrichedPaperTrade[] {
  const chronological = [...trades].sort(
    (a, b) => tradeSortKey(a) - tradeSortKey(b)
  );
  const lots = new Map<string, Lot[]>();
  const enrichedById = new Map<string, EnrichedPaperTrade>();

  for (const t of chronological) {
    const key = positionKey(t.symbol, t.exchange);
    const name = t.strategyName?.trim() || "";
    const id = t.strategyId;
    const auto = isStrategyTrade(t);
    const displayName = name || (auto ? "Auto strategy" : "Manual");

    if (t.side === "BUY") {
      const list = lots.get(key) ?? [];
      list.push({
        qty: t.qty,
        avgPrice: t.price,
        strategyName: displayName,
        strategyId: id,
      });
      lots.set(key, list);
      enrichedById.set(t.id, {
        ...t,
        displayStrategyName: displayName,
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

      const auto = isStrategyTrade(t);
      const sellDisplay =
        inheritedName || name || (auto ? "Auto strategy" : "Manual");
      enrichedById.set(t.id, {
        ...t,
        displayStrategyName: sellDisplay,
        displayStrategyId: inheritedId ?? id,
        strategyName: t.strategyName ?? (inheritedName || undefined),
        strategyId: t.strategyId ?? inheritedId,
      });
    }
  }

  return trades.map((t) => {
    const e = enrichedById.get(t.id);
    if (e) return e;
    const auto = isStrategyTrade(t);
    const name = t.strategyName?.trim() || (auto ? "Auto strategy" : "Manual");
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
  const chronological = [...enriched].sort(
    (a, b) => tradeSortKey(a) - tradeSortKey(b)
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

/** Per-symbol buy/sell timeline and P&L for one strategy (click-through detail). */
export function computeStrategyDetailBundles(
  trades: PaperTrade[],
  holdings: HoldingForPnl[] = []
): StrategyDetailBundle[] {
  const enriched = enrichTradesWithStrategy(trades);
  const summaryRows = computeStrategyPerformance(trades).filter(
    (r) => r.strategyName !== "Manual"
  );

  const holdingByKey = new Map<string, HoldingForPnl>();
  for (const h of holdings) {
    holdingByKey.set(positionKey(h.symbol, h.exchange), h);
  }

  return summaryRows.map((summary) => {
    const stratTrades = enriched
      .filter((t) =>
        matchesStrategy(t, summary.strategyName, summary.strategyId)
      )
      .sort((a, b) => tradeSortKey(a) - tradeSortKey(b));

    const bySymbol = new Map<string, EnrichedPaperTrade[]>();
    for (const t of stratTrades) {
      const key = positionKey(t.symbol, t.exchange);
      const list = bySymbol.get(key) ?? [];
      list.push(t);
      bySymbol.set(key, list);
    }

    const symbols: StrategySymbolDetail[] = [];

    for (const [key, symbolTrades] of bySymbol) {
      const [symbol, exchange] = key.split(":");
      const lots: Lot[] = [];
      const events: StrategyTradeEvent[] = [];
      let realizedPnl = 0;

      for (const t of symbolTrades) {
        const executedAtMs = tradeSortKey(t);
        if (t.side === "BUY") {
          lots.push({
            qty: t.qty,
            avgPrice: t.price,
            strategyName: summary.strategyName,
            strategyId: summary.strategyId,
          });
          events.push({
            tradeId: t.id,
            side: "BUY",
            qty: t.qty,
            price: t.price,
            total: t.qty * t.price,
            executedAtMs,
            dateTimeLabel: formatTradeDateTime(t),
            reason: t.reason,
          });
        } else {
          let sellQty = t.qty;
          let sellPnl = 0;
          let matchedBuy = 0;
          let matchedQty = 0;

          while (sellQty > 0 && lots.length > 0) {
            const lot = lots[0];
            const take = Math.min(sellQty, lot.qty);
            sellPnl += (t.price - lot.avgPrice) * take;
            matchedBuy += lot.avgPrice * take;
            matchedQty += take;
            lot.qty -= take;
            sellQty -= take;
            if (lot.qty <= 0) lots.shift();
          }

          const avgBuy = matchedQty > 0 ? matchedBuy / matchedQty : undefined;
          realizedPnl += sellPnl;
          events.push({
            tradeId: t.id,
            side: "SELL",
            qty: t.qty,
            price: t.price,
            total: t.qty * t.price,
            executedAtMs,
            dateTimeLabel: formatTradeDateTime(t),
            reason: t.reason,
            realizedPnl: sellPnl,
            matchedBuyPrice: avgBuy,
          });
        }
      }

      const openQty = lots.reduce((s, l) => s + l.qty, 0);
      const openCost = lots.reduce((s, l) => s + l.qty * l.avgPrice, 0);
      const openAvgCost = openQty > 0 ? openCost / openQty : 0;
      const holding = holdingByKey.get(key);
      const ltp = holding?.ltp ?? openAvgCost;
      const unrealizedPnl =
        openQty > 0 ? (ltp - openAvgCost) * openQty : 0;

      symbols.push({
        symbol,
        exchange,
        events: events.sort((a, b) => b.executedAtMs - a.executedAtMs),
        realizedPnl,
        openQty,
        openAvgCost,
        unrealizedPnl,
        status: openQty > 0 ? "open" : "closed",
      });
    }

    symbols.sort(
      (a, b) =>
        b.realizedPnl +
        b.unrealizedPnl -
        (a.realizedPnl + a.unrealizedPnl)
    );

    return {
      key: strategyDetailKey(summary.strategyName, summary.strategyId),
      strategyId: summary.strategyId,
      strategyName: summary.strategyName,
      summary,
      symbols,
    };
  });
}
