import type { PaperTradingState } from "@/lib/firebase";
import {
  canTransitionPosition,
  type ExitReason,
  type PaperPosition,
  type PositionState,
  OWNER_MANUAL,
} from "./types";
import { migrateHoldingsToPositions } from "./migrate";
import { syncHoldingsFromPositions } from "./sync-holdings";

function symKey(symbol: string, exchange: string): string {
  return `${symbol.trim().toUpperCase()}:${(exchange || "NSE").trim().toUpperCase()}`;
}

/** One open row per symbol — sum qty / weighted avg when duplicates exist. */
export function collapseOpenPositionsBySymbol(
  positions: PaperPosition[]
): PaperPosition[] {
  const closed: PaperPosition[] = [];
  const openByKey = new Map<string, PaperPosition>();

  for (const p of positions) {
    if (p.state !== "OPEN" && p.state !== "PARTIAL_EXIT") {
      closed.push(p);
      continue;
    }
    const key = symKey(p.symbol, p.exchange);
    const existing = openByKey.get(key);
    if (!existing) {
      openByKey.set(key, { ...p });
      continue;
    }
    const newQty = existing.quantity + p.quantity;
    const avg =
      newQty > 0
        ? Math.round(
            ((existing.entryPrice * existing.quantity +
              p.entryPrice * p.quantity) /
              newQty) *
              100
          ) / 100
        : existing.entryPrice;
    const existingMs = Date.parse(existing.entryTime) || 0;
    const nextMs = Date.parse(p.entryTime) || 0;
    const earlier = nextMs > 0 && (existingMs === 0 || nextMs < existingMs);
    openByKey.set(key, {
      ...existing,
      quantity: newQty,
      entryPrice: avg,
      ltp: p.ltp > 0 ? p.ltp : existing.ltp,
      entryTime: earlier ? p.entryTime : existing.entryTime,
      peakPrice: Math.max(
        existing.peakPrice ?? 0,
        p.peakPrice ?? 0,
        p.ltp ?? 0,
        existing.ltp ?? 0
      ),
      buySignalCount:
        Math.max(existing.buySignalCount ?? 0, p.buySignalCount ?? 0) ||
        existing.buySignalCount,
      signalReason: existing.signalReason ?? p.signalReason,
    });
  }

  return [...closed, ...openByKey.values()];
}

export function ensurePositions(state: PaperTradingState): PaperTradingState {
  const holdings = state.holdings ?? [];
  let positions = [...(state.positions ?? [])];

  if (positions.length === 0) {
    if (holdings.length === 0) {
      return { ...state, positions: [], holdings: [] };
    }
    positions = migrateHoldingsToPositions(holdings, state.trades ?? []);
    return withSyncedHoldings({ ...state, positions });
  }

  const openKeys = new Set(
    positions
      .filter((p) => p.state === "OPEN" || p.state === "PARTIAL_EXIT")
      .map((p) => symKey(p.symbol, p.exchange))
  );
  const orphanHoldings = holdings.filter(
    (h) => (h.qty ?? 0) > 0 && !openKeys.has(symKey(h.symbol, h.exchange))
  );
  if (orphanHoldings.length > 0) {
    positions = [
      ...positions,
      ...migrateHoldingsToPositions(orphanHoldings, state.trades ?? []),
    ];
  }

  positions = collapseOpenPositionsBySymbol(positions);
  return withSyncedHoldings({ ...state, positions });
}

export function withSyncedHoldings(state: PaperTradingState): PaperTradingState {
  const positions = state.positions ?? [];
  return {
    ...state,
    positions,
    holdings: syncHoldingsFromPositions(positions),
  };
}

export function getOpenPositions(
  state: PaperTradingState,
  filter?: { ownerStrategyId?: string; symbol?: string; exchange?: string }
): PaperPosition[] {
  const positions = state.positions ?? [];
  return positions.filter((p) => {
    if (p.state !== "OPEN" && p.state !== "PARTIAL_EXIT") return false;
    if (filter?.ownerStrategyId && p.ownerStrategyId !== filter.ownerStrategyId) {
      return false;
    }
    if (filter?.symbol && p.symbol.toUpperCase() !== filter.symbol.toUpperCase()) {
      return false;
    }
    if (
      filter?.exchange &&
      (p.exchange || "NSE").toUpperCase() !== filter.exchange.toUpperCase()
    ) {
      return false;
    }
    return true;
  });
}

export function getOwnerPosition(
  state: PaperTradingState,
  symbol: string,
  exchange: string,
  ownerStrategyId: string
): PaperPosition | undefined {
  return getOpenPositions(state, { symbol, exchange, ownerStrategyId })[0];
}

export function hasOpenPositionForSymbol(
  state: PaperTradingState,
  symbol: string,
  exchange: string
): boolean {
  if (getOpenPositions(state, { symbol, exchange }).length > 0) return true;
  const key = symKey(symbol, exchange);
  return (state.holdings ?? []).some(
    (h) => symKey(h.symbol, h.exchange) === key && (h.qty ?? 0) > 0
  );
}

export function getPositionOwnerForSymbol(
  state: PaperTradingState,
  symbol: string,
  exchange: string
): string | null {
  const open = getOpenPositions(state, { symbol, exchange });
  return open[0]?.ownerStrategyId ?? null;
}

/** Duplicate symbol protection — default: one open position per symbol. */
export function canStrategyOpenPosition(
  state: PaperTradingState,
  symbol: string,
  exchange: string,
  ownerStrategyId: string,
  multiStrategyMode = false
): { allowed: boolean; reason?: string } {
  const open = getOpenPositions(state, { symbol, exchange });
  if (open.length === 0) return { allowed: true };

  const sameOwner = open.some((p) => p.ownerStrategyId === ownerStrategyId);
  if (sameOwner) {
    return {
      allowed: false,
      reason: "Position already open for this strategy on symbol",
    };
  }

  if (!multiStrategyMode) {
    const owner = open[0].ownerStrategyName ?? open[0].ownerStrategyId;
    return {
      allowed: false,
      reason: `Symbol owned by ${owner} — duplicate exposure blocked`,
    };
  }

  return { allowed: true };
}

/** Only owner strategy may exit its position; manual override can close any. */
export function canStrategyExitPosition(
  state: PaperTradingState,
  symbol: string,
  exchange: string,
  requestingStrategyId: string
): { allowed: boolean; reason?: string; position?: PaperPosition } {
  const open = getOpenPositions(state, { symbol, exchange });
  if (open.length === 0) {
    return { allowed: false, reason: "No open position" };
  }

  if (requestingStrategyId === OWNER_MANUAL) {
    return { allowed: true, position: open[0] };
  }

  const owned = open.find((p) => p.ownerStrategyId === requestingStrategyId);
  if (!owned) {
    const actualOwner = open[0].ownerStrategyName ?? open[0].ownerStrategyId;
    return {
      allowed: false,
      reason: `Exit denied — position owned by ${actualOwner}`,
    };
  }

  return { allowed: true, position: owned };
}

/** Open position to close for a manual paper exit (any owner). */
export function getManualExitPosition(
  state: PaperTradingState,
  symbol: string,
  exchange: string
): PaperPosition | undefined {
  return getOpenPositions(state, { symbol, exchange })[0];
}

export function transitionPosition(
  position: PaperPosition,
  to: PositionState
): PaperPosition | null {
  if (!canTransitionPosition(position.state, to)) return null;
  return { ...position, state: to };
}

export function createOpenPosition(params: {
  symbol: string;
  exchange: string;
  quantity: number;
  entryPrice: number;
  ltp: number;
  ownerStrategyId: string;
  ownerStrategyName?: string;
  ownerStrategyType?: import("@/lib/strategies/definitions").StrategyType;
  ownerEntryArchetype?: import("@/lib/strategies/entry-exit-compat").EntryArchetype;
  signalReason?: string;
  stopLoss?: number;
  target?: number;
  product?: string;
  buySignalCount?: number;
  signalStrategyNames?: string[];
}): PaperPosition {
  const now = new Date().toISOString();
  return {
    id: `pos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    symbol: params.symbol.trim().toUpperCase(),
    exchange: (params.exchange || "NSE").trim().toUpperCase(),
    quantity: params.quantity,
    entryPrice: params.entryPrice,
    ltp: params.ltp,
    ownerStrategyId: params.ownerStrategyId,
    ownerStrategyName: params.ownerStrategyName,
    ownerStrategyType: params.ownerStrategyType,
    ownerEntryArchetype: params.ownerEntryArchetype,
    state: "OPEN",
    entryTime: now,
    signalReason: params.signalReason,
    stopLoss: params.stopLoss,
    target: params.target,
    product: params.product,
    buySignalCount: params.buySignalCount,
    peakPrice: params.ltp > 0 ? params.ltp : params.entryPrice,
  };
}

export function closePositionInState(
  state: PaperTradingState,
  positionId: string,
  exitPrice: number,
  exitReason: ExitReason,
  exitQty?: number
): { state: PaperTradingState; position?: PaperPosition; closedQty: number } {
  const positions = [...(state.positions ?? [])];
  const idx = positions.findIndex((p) => p.id === positionId);
  if (idx < 0) return { state, closedQty: 0 };

  const pos = positions[idx];
  const qty = Math.min(exitQty ?? pos.quantity, pos.quantity);
  const now = new Date().toISOString();

  if (qty >= pos.quantity) {
    const closed = transitionPosition(
      {
        ...pos,
        exitTime: now,
        exitPrice,
        exitReason,
        quantity: 0,
      },
      "CLOSED"
    );
    if (!closed) return { state, closedQty: 0 };
    positions[idx] = closed;
  } else {
    const partial = transitionPosition(
      {
        ...pos,
        quantity: pos.quantity - qty,
        state: "PARTIAL_EXIT",
      },
      "PARTIAL_EXIT"
    );
    if (!partial) return { state, closedQty: 0 };
    positions[idx] = partial;
  }

  return {
    state: withSyncedHoldings({ ...state, positions }),
    position: { ...pos, quantity: qty, exitTime: now, exitPrice, exitReason },
    closedQty: qty,
  };
}

export function addPositionToState(
  state: PaperTradingState,
  position: PaperPosition
): PaperTradingState {
  const positions = collapseOpenPositionsBySymbol([
    ...(state.positions ?? []),
    position,
  ]);
  return withSyncedHoldings({ ...state, positions });
}

/** Increase qty / recompute avg on an existing open lot (add-on fill). */
export function addToOpenPosition(
  state: PaperTradingState,
  positionId: string,
  addQty: number,
  costPerShare: number,
  ltp?: number
): PaperTradingState {
  if (addQty <= 0) return state;
  const positions = [...(state.positions ?? [])];
  const idx = positions.findIndex((p) => p.id === positionId);
  if (idx < 0) return state;
  const pos = positions[idx];
  if (pos.state !== "OPEN" && pos.state !== "PARTIAL_EXIT") return state;
  const newQty = pos.quantity + addQty;
  const avg =
    Math.round(
      ((pos.entryPrice * pos.quantity + costPerShare * addQty) / newQty) * 100
    ) / 100;
  positions[idx] = {
    ...pos,
    quantity: newQty,
    entryPrice: avg,
    ltp: ltp && ltp > 0 ? ltp : pos.ltp,
    peakPrice: Math.max(pos.peakPrice ?? 0, ltp ?? 0, pos.ltp ?? 0),
  };
  return withSyncedHoldings({ ...state, positions });
}

export function refreshPositionLtps(
  state: PaperTradingState,
  ltpByKey: Record<string, number>
): PaperTradingState {
  const positions = (state.positions ?? []).map((p) => {
    const key = symKey(p.symbol, p.exchange);
    const ltp = ltpByKey[key];
    if (ltp && ltp > 0) return { ...p, ltp };
    return p;
  });
  return withSyncedHoldings({ ...state, positions });
}
