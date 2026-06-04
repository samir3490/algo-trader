import type { OHLC } from "@/types";
import { calculateRSI } from "@/lib/utils";
import { BaseStrategy } from "@/lib/strategies/base-strategy";
import type { StructuredSignal } from "@/lib/trading/structured-signal";

/** RSI mean reversion — oversold curl-up entry, exit when RSI crosses 50. */
export class RSIMeanReversionStrategy extends BaseStrategy {
  readonly id = "RSI_MEAN_REVERSION";
  readonly name = "RSI Mean Reversion";

  evaluate(
    symbol: string,
    candles: OHLC[],
    params: Record<string, number>
  ): StructuredSignal | null {
    const period = params.rsiPeriod ?? params.period ?? 14;
    const oversold = params.oversoldThreshold ?? params.oversold ?? 30;
    const exitLevel = params.exitRsiLevel ?? 50;
    const qty = params.quantity ?? 1;

    if (candles.length < period + 3) return null;

    const closes = candles.map((c) => c.close);
    const rsi = calculateRSI(closes, period);
    const i = closes.length - 1;
    const p = i - 1;
    const cur = rsi[i];
    const prev = rsi[p];
    if (Number.isNaN(cur) || Number.isNaN(prev)) return null;

    const price = closes[i];
    const ts = candles[i].date;
    const stopLossPct = params.stopLossPct ?? 2;
    const targetPct = params.targetPct ?? 5;

    // BUY: was oversold and RSI curling up
    if (prev < oversold && cur > prev && cur < exitLevel) {
      return {
        strategyName: this.name,
        symbol,
        signalType: "BUY",
        price,
        timestamp: ts,
        quantity: qty,
        confidence: 0.7,
        indicatorsUsed: { rsi: cur, oversold, prevRsi: prev },
        reason: `RSI curling up from oversold (${cur.toFixed(1)})`,
        stopLoss: price * (1 - stopLossPct / 100),
        target: price * (1 + targetPct / 100),
      };
    }

    // EXIT: mean reversion complete — RSI back above 50
    if (prev < exitLevel && cur >= exitLevel) {
      return {
        strategyName: this.name,
        symbol,
        signalType: "EXIT",
        price,
        timestamp: ts,
        quantity: qty,
        confidence: 0.65,
        indicatorsUsed: { rsi: cur, exitLevel },
        reason: `RSI crossed above ${exitLevel} — take profit / exit`,
      };
    }

    return null;
  }
}

export const rsiMeanReversion = new RSIMeanReversionStrategy();
