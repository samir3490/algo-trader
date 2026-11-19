import type { PaperTrade } from "@/lib/firebase";
import {
  formatTradeDateTime,
  formatTradeDateTimeCompact,
  isStrategyTrade,
  tradeExecutedAtMs,
} from "@/lib/paper-trades/normalize";

export interface EnrichedPaperTrade extends PaperTrade {
  /** Primary label (first strategy or Manual). */
  displayStrategyName: string;
  /** All strategies that contributed to a multi-signal BUY. */
  displayStrategyNames: string[];
  /** Signals without stored names (legacy trades). */
  unknownStrategyCount: number;
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
  winRate: number;
  avgHoldDays: number;
}

export interface StrategyTradeEvent {
  tradeId: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  total: number;
  executedAtMs: number;
  dateTimeLabel: string;
  /** Full timestamp for hover tooltip. */
  dateTimeTitle?: string;
  reason?: string;
  strategyNames?: string[];
  unknownStrategyCount?: number;
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

/** One performance row per strategy name (not per active instance / symbol). */
export function strategyGroupKey(name: string): string {
  return name.trim() || "Unknown";
}

export function strategyDetailKey(name: string, _id?: string): string {
  return `name:${strategyGroupKey(name)}`;
}

function matchesStrategy(t: EnrichedPaperTrade, name: string): boolean {
  return t.displayStrategyName === name;
}

function resolveStrategyId(t: PaperTrade): string | undefined {
  return t.ownerStrategyId ?? t.strategyId;
}

type Lot = {
  qty: number;
  avgPrice: number;
  strategyName: string;
  strategyNames: string[];
  unknownStrategyCount: number;
  strategyId?: string;
};

export interface EnrichTradesOptions {
  /** Active strategy names per symbol — used to infer missing multi-signal names. */
  strategyNamesBySymbol?: Map<string, string[]>;
  /** Include Manual / untagged fills in strategy performance (needed for live). */
  includeManual?: boolean;
}

/** Build lookup from active strategy instances for legacy trade backfill. */
export function buildStrategyNamesBySymbol(
  strategies: { symbol: string; exchange?: string; name: string }[]
): Map<string, string[]> {
  const map = new Map<string, Set<string>>();
  for (const s of strategies) {
    const key = positionKey(s.symbol, s.exchange ?? "NSE");
    const set = map.get(key) ?? new Set();
    set.add(s.name.trim());
    map.set(key, set);
  }
  return new Map([...map.entries()].map(([k, v]) => [k, [...v]]));
}

function resolveStrategyNames(
  t: PaperTrade,
  options?: EnrichTradesOptions
): { names: string[]; unknownCount: number } {
  const stored = t.signalStrategyNames?.filter((n) => n.trim()) ?? [];
  if (stored.length > 0) {
    const unknownCount = Math.max(0, (t.buySignalCount ?? stored.length) - stored.length);
    return { names: stored, unknownCount };
  }

  const owner = t.strategyName?.trim();
  const key = positionKey(t.symbol, t.exchange);
  const candidates = options?.strategyNamesBySymbol?.get(key) ?? [];
  const unique = [...new Set(candidates.filter((n) => n.trim()))];

  let names: string[] = [];
  const signalCount = t.buySignalCount ?? 0;

  if (signalCount > 1 && unique.length >= signalCount) {
    if (owner && unique.includes(owner)) names.push(owner);
    for (const n of unique) {
      if (!names.includes(n) && names.length < signalCount) names.push(n);
    }
    if (names.length < signalCount) {
      names = unique.slice(0, signalCount);
    }
  } else if (owner) {
    names = [owner];
  } else if (unique.length > 0) {
    names = [unique[0]];
  } else if (isStrategyTrade(t)) {
    names = ["Auto strategy"];
  } else if (t.side === "BUY" || t.strategyName) {
    names = [];
  }

  const unknownCount =
    signalCount > names.length ? signalCount - names.length : 0;
  return { names, unknownCount };
}

/** Human-readable strategy label (comma-separated names). */
export function formatTradeStrategyLabel(
  t: Pick<PaperTrade, "signalStrategyNames" | "strategyName" | "buySignalCount"> & {
    displayStrategyName?: string;
    displayStrategyNames?: string[];
  }
): string {
  const names = t.displayStrategyNames?.filter((n) => n.trim());
  if (names && names.length > 0) return names.join(", ");
  const stored = t.signalStrategyNames?.filter((n) => n.trim());
  if (stored && stored.length > 0) return stored.join(", ");
  const owner = t.strategyName?.trim() || t.displayStrategyName?.trim() || "";
  return owner || "Manual";
}

function positionKey(symbol: string, exchange: string): string {
  return `${symbol.trim().toUpperCase()}:${(exchange || "NSE").trim().toUpperCase()}`;
}

function tradeSortKey(t: PaperTrade): number {
  return tradeExecutedAtMs(t);
}

/** Attach strategy labels to sells that predate strategyName on SELL rows. */
export function enrichTradesWithStrategy(
  trades: PaperTrade[],
  options?: EnrichTradesOptions
): EnrichedPaperTrade[] {
  const chronological = [...trades].sort(
    (a, b) => tradeSortKey(a) - tradeSortKey(b)
  );
  const lots = new Map<string, Lot[]>();
  const enrichedById = new Map<string, EnrichedPaperTrade>();

  for (const t of chronological) {
    const key = positionKey(t.symbol, t.exchange);
    const name = t.strategyName?.trim() || "";
    const id = resolveStrategyId(t);
    const auto = isStrategyTrade(t);
    const resolved = resolveStrategyNames(t, options);
    const fallback =
      t.strategyName?.trim() || (auto ? "Auto strategy" : "Manual");
    const displayNames =
      resolved.names.length > 0
        ? resolved.names
        : fallback
          ? [fallback]
          : [];
    const displayName = formatTradeStrategyLabel({
      ...t,
      displayStrategyNames: displayNames,
      displayStrategyName: displayNames[0] ?? fallback,
    });

    if (t.side === "BUY") {
      const list = lots.get(key) ?? [];
      list.push({
        qty: t.qty,
        avgPrice: t.price,
        strategyName: displayName,
        strategyNames: displayNames,
        unknownStrategyCount: resolved.unknownCount,
        strategyId: id,
      });
      lots.set(key, list);
      enrichedById.set(t.id, {
        ...t,
        displayStrategyName: displayName,
        displayStrategyNames: displayNames,
        unknownStrategyCount: resolved.unknownCount,
        displayStrategyId: id,
      });
    } else {
      let sellQty = t.qty;
      let inheritedName = name;
      let inheritedId = id;
      let inheritedNames: string[] = [];
      let inheritedUnknown = 0;
      const list = lots.get(key) ?? [];

      while (sellQty > 0 && list.length > 0) {
        const lot = list[0];
        if (!inheritedName && lot.strategyName !== "Manual") {
          inheritedName = lot.strategyName;
          inheritedId = lot.strategyId;
        }
        if (inheritedNames.length === 0 && lot.strategyNames.length > 0) {
          inheritedNames = lot.strategyNames;
          inheritedUnknown = lot.unknownStrategyCount;
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
      const sellNames =
        inheritedNames.length > 0
          ? inheritedNames
          : resolveStrategyNames(t, options).names;
      const sellUnknown =
        inheritedNames.length > 0
          ? inheritedUnknown
          : resolveStrategyNames(t, options).unknownCount;
      enrichedById.set(t.id, {
        ...t,
        displayStrategyName: formatTradeStrategyLabel({
          ...t,
          strategyName: inheritedName || name || t.strategyName,
          displayStrategyNames: sellNames,
          displayStrategyName: sellDisplay,
        }),
        displayStrategyNames: sellNames,
        unknownStrategyCount: sellUnknown,
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
    const resolved = resolveStrategyNames(t, options);
    const fallback =
      t.strategyName?.trim() || (auto ? "Auto strategy" : "Manual");
    const displayNames =
      resolved.names.length > 0 ? resolved.names : fallback ? [fallback] : [];
    const displayName = formatTradeStrategyLabel({
      ...t,
      displayStrategyNames: displayNames,
      displayStrategyName: displayNames[0] ?? fallback,
    });
    return {
      ...t,
      displayStrategyName: displayName,
      displayStrategyNames: displayNames,
      unknownStrategyCount: resolved.unknownCount,
      displayStrategyId: resolveStrategyId(t),
    };
  });
}

/** Realized P&L per strategy from closed round-trips (FIFO per symbol). */
export function computeStrategyPerformance(
  trades: PaperTrade[],
  options?: EnrichTradesOptions
): StrategyPerformanceRow[] {
  const enriched = enrichTradesWithStrategy(trades, options);
  const chronological = [...enriched].sort(
    (a, b) => tradeSortKey(a) - tradeSortKey(b)
  );

  const lots = new Map<string, (Lot & { entryMs: number })[]>();
  const stats = new Map<string, StrategyPerformanceRow>();
  const holdDaysSum = new Map<string, number>();
  const holdCount = new Map<string, number>();

  function getRow(name: string): StrategyPerformanceRow {
    const key = strategyGroupKey(name);
    let row = stats.get(key);
    if (!row) {
      row = {
        strategyName: name,
        trades: 0,
        buys: 0,
        sells: 0,
        realizedPnl: 0,
        closedRounds: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        avgHoldDays: 0,
      };
      stats.set(key, row);
    }
    return row;
  }

  function recordHold(strategyName: string, entryMs: number, exitMs: number) {
    const key = strategyGroupKey(strategyName);
    const days = Math.max(0, (exitMs - entryMs) / 86_400_000);
    holdDaysSum.set(key, (holdDaysSum.get(key) ?? 0) + days);
    holdCount.set(key, (holdCount.get(key) ?? 0) + 1);
  }

  for (const t of chronological) {
    const stratName =
      t.displayStrategyNames?.[0] ?? t.strategyName?.trim() ?? t.displayStrategyName;
    const row = getRow(stratName);
    row.trades += 1;

    const key = positionKey(t.symbol, t.exchange);

    if (t.side === "BUY") {
      row.buys += 1;
      const list = lots.get(key) ?? [];
      list.push({
        qty: t.qty,
        avgPrice: t.price,
        strategyName: stratName,
        strategyNames: t.displayStrategyNames ?? [stratName],
        unknownStrategyCount: t.unknownStrategyCount ?? 0,
        strategyId: t.displayStrategyId,
        entryMs: tradeSortKey(t),
      });
      lots.set(key, list);
    } else {
      row.sells += 1;
      let sellQty = t.qty;
      const sellMs = tradeSortKey(t);
      const list = lots.get(key) ?? [];

      while (sellQty > 0 && list.length > 0) {
        const lot = list[0];
        const take = Math.min(sellQty, lot.qty);
        const pnl = (t.price - lot.avgPrice) * take;
        const lotRow = getRow(lot.strategyName);
        lotRow.realizedPnl += pnl;
        lotRow.closedRounds += 1;
        if (pnl > 0) lotRow.wins += 1;
        else if (pnl < 0) lotRow.losses += 1;
        recordHold(lot.strategyName, lot.entryMs, sellMs);

        lot.qty -= take;
        sellQty -= take;
        if (lot.qty <= 0) list.shift();
      }
      lots.set(key, list);
    }
  }

  for (const row of stats.values()) {
    const key = strategyGroupKey(row.strategyName);
    row.winRate =
      row.closedRounds > 0
        ? Math.round((row.wins / row.closedRounds) * 1000) / 10
        : 0;
    const holds = holdCount.get(key) ?? 0;
    row.avgHoldDays =
      holds > 0
        ? Math.round(((holdDaysSum.get(key) ?? 0) / holds) * 10) / 10
        : 0;
  }

  return [...stats.values()]
    .filter((r) => r.strategyName !== "Manual" || r.trades > 0)
    .sort((a, b) => b.realizedPnl - a.realizedPnl);
}

/** Per-symbol buy/sell timeline and P&L for one strategy (click-through detail). */
export function computeStrategyDetailBundles(
  trades: PaperTrade[],
  holdings: HoldingForPnl[] = [],
  options?: EnrichTradesOptions
): StrategyDetailBundle[] {
  const enriched = enrichTradesWithStrategy(trades, options);
  const summaryRows = computeStrategyPerformance(trades, options).filter(
    (r) => options?.includeManual === true || r.strategyName !== "Manual"
  );

  const holdingByKey = new Map<string, HoldingForPnl>();
  for (const h of holdings) {
    holdingByKey.set(positionKey(h.symbol, h.exchange), h);
  }

  return summaryRows.map((summary) => {
    const stratTrades = enriched
      .filter((t) => matchesStrategy(t, summary.strategyName))
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
            strategyNames: t.displayStrategyNames ?? [summary.strategyName],
            unknownStrategyCount: t.unknownStrategyCount ?? 0,
            strategyId: summary.strategyId,
          });
          events.push({
            tradeId: t.id,
            side: "BUY",
            qty: t.qty,
            price: t.price,
            total: t.qty * t.price,
            executedAtMs,
            dateTimeLabel: formatTradeDateTimeCompact(t),
            dateTimeTitle: formatTradeDateTime(t),
            reason: t.reason,
            strategyNames: t.displayStrategyNames,
            unknownStrategyCount: t.unknownStrategyCount,
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
            dateTimeLabel: formatTradeDateTimeCompact(t),
            dateTimeTitle: formatTradeDateTime(t),
            reason: t.reason,
            strategyNames: t.displayStrategyNames,
            unknownStrategyCount: t.unknownStrategyCount,
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
