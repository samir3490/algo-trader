import type { StrategyType } from "@/lib/strategies/definitions";
import type { EntryArchetype } from "@/lib/strategies/entry-exit-compat";

/** Position lifecycle — invalid transitions are rejected by PositionManager. */
export type PositionState =
  | "PENDING"
  | "OPEN"
  | "PARTIAL_EXIT"
  | "CLOSED"
  | "CANCELLED";

export type ExitReason =
  | "STOP_LOSS"
  | "TARGET_HIT"
  | "TRAILING_STOP"
  | "TIME_EXIT"
  | "RISK_LIMIT"
  | "MANUAL_EXIT"
  | "OWNER_STRATEGY_EXIT"
  | "MIS_SQUARE_OFF"
  | "DUPLICATE_EXPOSURE";

export const OWNER_MANUAL = "manual";
export const OWNER_RISK = "risk_guard";

export interface PaperPosition {
  id: string;
  symbol: string;
  exchange: string;
  quantity: number;
  entryPrice: number;
  ltp: number;
  ownerStrategyId: string;
  ownerStrategyName?: string;
  ownerStrategyType?: StrategyType;
  ownerEntryArchetype?: EntryArchetype;
  state: PositionState;
  entryTime: string;
  signalReason?: string;
  stopLoss?: number;
  target?: number;
  exitTime?: string;
  exitPrice?: number;
  exitReason?: ExitReason;
  product?: string;
  buySignalCount?: number;
  signalStrategyNames?: string[];
  /** Peak LTP since entry — for trailing stop. */
  peakPrice?: number;
}
export interface StrategyOpinion {
  strategyId: string;
  strategyName: string;
  strategyType?: StrategyType;
  symbol: string;
  exchange: string;
  action: "BUY" | "SELL" | "HOLD";
  price: number;
  quantity: number;
  reason: string;
  confidence: number;
  /** Scan confidence when available (universe ranking). */
  scanConfidence?: number;
  /** Strategies that signaled BUY on this symbol in the same scan. */
  buySignalCount?: number;
  /** Strategies that signaled SELL on this symbol in the same scan. */
  sellSignalCount?: number;
  signalStrategyNames?: string[];
  /** Sum of confidence from all strategies signaling BUY/SELL on this symbol. */
  confidenceSum?: number;
}

export type PortfolioAction = "BUY" | "SELL" | "HOLD" | "SKIP";

/** Final decision from PortfolioManager before order engine. */
export interface PortfolioDecision {
  action: PortfolioAction;
  symbol: string;
  exchange: string;
  ownerStrategyId: string;
  ownerStrategyName: string;
  ownerStrategyType?: StrategyType;
  ownerEntryArchetype?: EntryArchetype;
  price: number;
  quantity: number;
  signalReason: string;
  exitReason?: ExitReason;
  skipReason?: string;
  positionId?: string;
  buySignalCount?: number;
  sellSignalCount?: number;
  signalStrategyNames?: string[];
  scanConfidence?: number;
  confidenceSum?: number;
}

export interface StrategyConflict {
  symbol: string;
  exchange: string;
  type: "CONFLICTING_STRATEGY_SIGNAL";
  buyStrategyIds: string[];
  sellStrategyIds: string[];
  message: string;
  detectedAt: string;
}

export interface TradeAuditEntry {
  id: string;
  strategyName: string;
  ownerStrategyId: string;
  symbol: string;
  exchange: string;
  signalReason?: string;
  signalStrength?: string;
  entryTime?: string;
  entryPrice?: number;
  exitTime?: string;
  exitPrice?: number;
  exitReason?: ExitReason;
  side: "BUY" | "SELL";
  qty: number;
  netPnl?: number;
  executedAt?: string;
}

const VALID_TRANSITIONS: Record<PositionState, PositionState[]> = {
  PENDING: ["OPEN", "CANCELLED"],
  OPEN: ["PARTIAL_EXIT", "CLOSED"],
  PARTIAL_EXIT: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

export function canTransitionPosition(
  from: PositionState,
  to: PositionState
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function mapRiskExitToReason(
  reason:
    | "stop_loss"
    | "take_profit"
    | "mis_square_off"
    | "trailing_stop"
    | "max_hold_days"
    | "no_progress"
): ExitReason {
  if (reason === "stop_loss") return "STOP_LOSS";
  if (reason === "take_profit") return "TARGET_HIT";
  if (reason === "trailing_stop") return "TRAILING_STOP";
  return "TIME_EXIT";
}
