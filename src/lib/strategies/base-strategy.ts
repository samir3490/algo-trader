import type { OHLC } from "@/types";
import type { StructuredSignal } from "@/lib/trading/structured-signal";

/**
 * Strategies only read candles and emit signals — no balances or broker calls.
 * (SmartAlgo BaseStrategy pattern, TypeScript port.)
 */
export abstract class BaseStrategy {
  abstract readonly name: string;
  abstract readonly id: string;

  abstract evaluate(
    symbol: string,
    candles: OHLC[],
    params: Record<string, number>
  ): StructuredSignal | null;

  protected hold(
    symbol: string,
    price: number,
    timestamp: Date,
    reason: string
  ): StructuredSignal {
    return {
      strategyName: this.name,
      symbol,
      signalType: "HOLD",
      price,
      timestamp,
      indicatorsUsed: {},
      reason,
    };
  }
}
