import type { OHLC, StrategySignal } from "@/types";

export type StructuredSignalType = "BUY" | "SELL" | "EXIT" | "HOLD";

/** SmartAlgo-style signal — strategies emit this; execution layers consume it. */
export interface StructuredSignal {
  strategyName: string;
  symbol: string;
  signalType: StructuredSignalType;
  price: number;
  timestamp: Date;
  indicatorsUsed: Record<string, number>;
  reason: string;
  stopLoss?: number;
  target?: number;
  quantity?: number;
  confidence?: number;
}

export function toStrategySignal(sig: StructuredSignal): StrategySignal {
  const action =
    sig.signalType === "EXIT" ? "SELL" : sig.signalType === "HOLD" ? "HOLD" : sig.signalType;
  return {
    symbol: sig.symbol,
    action: action as "BUY" | "SELL" | "HOLD",
    price: sig.price,
    quantity: sig.quantity ?? 1,
    reason: sig.reason,
    confidence: sig.confidence ?? 0.5,
    timestamp: sig.timestamp,
  };
}

export function fromStrategySignal(
  sig: StrategySignal,
  strategyName: string,
  indicatorsUsed: Record<string, number> = {}
): StructuredSignal {
  return {
    strategyName,
    symbol: sig.symbol,
    signalType: sig.action === "HOLD" ? "HOLD" : sig.action,
    price: sig.price,
    timestamp: sig.timestamp,
    indicatorsUsed,
    reason: sig.reason,
    quantity: sig.quantity,
    confidence: sig.confidence,
  };
}

export type CandleSeries = OHLC[];
