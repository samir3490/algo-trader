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

export function ensurePositions(state: PaperTradingState): PaperTradingState {
  if (state.positions && state.positions.length > 0) {
    return withSyncedHoldings(state);
  }
  const holdings = state.holdings ?? [];
  if (holdings.length === 0) {
    return { ...state, positions: [], holdings: [] };
  }
  const positions = migrateHoldingsToPositions(holdings, state.trades ?? []);
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
  return getOpenPositions(state, { symbol, exchange }).length > 0;
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
  const positions = [...(state.positions ?? []), position];
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
