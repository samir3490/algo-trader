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
  state: PositionState;
  entryTime: string;
  signalReason?: string;
  stopLoss?: number;
  target?: number;
  exitTime?: string;
  exitPrice?: number;
  exitReason?: ExitReason;
  product?: string;
}

/** Strategy opinion — advisors only; does not place orders. */
export interface StrategyOpinion {
  strategyId: string;
  strategyName: string;
  symbol: string;
  exchange: string;
  action: "BUY" | "SELL" | "HOLD";
  price: number;
  quantity: number;
  reason: string;
  confidence: number;
}

export type PortfolioAction = "BUY" | "SELL" | "HOLD" | "SKIP";

/** Final decision from PortfolioManager before order engine. */
export interface PortfolioDecision {
  action: PortfolioAction;
  symbol: string;
  exchange: string;
  ownerStrategyId: string;
  ownerStrategyName: string;
  price: number;
  quantity: number;
  signalReason: string;
  exitReason?: ExitReason;
  skipReason?: string;
  positionId?: string;
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
  entryTime?: string;
  entryPrice?: number;
  exitTime?: string;
  exitPrice?: number;
  exitReason?: ExitReason;
  side: "BUY" | "SELL";
  qty: number;
  netPnl?: number;
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
  reason: "stop_loss" | "take_profit" | "mis_square_off"
): ExitReason {
  if (reason === "stop_loss") return "STOP_LOSS";
  if (reason === "take_profit") return "TARGET_HIT";
  return "TIME_EXIT";
}
