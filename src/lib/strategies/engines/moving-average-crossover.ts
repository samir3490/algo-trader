import type { OHLC } from "@/types";
import { calculateSMA } from "@/lib/utils";
import { BaseStrategy } from "@/lib/strategies/base-strategy";
import type { StructuredSignal } from "@/lib/trading/structured-signal";

export class MovingAverageCrossoverStrategy extends BaseStrategy {
  readonly id = "MA_CROSSOVER";
  readonly name = "Moving Average Crossover";

  evaluate(
    symbol: string,
    candles: OHLC[],
    params: Record<string, number>
  ): StructuredSignal | null {
    const shortWindow = params.short_window ?? params.shortPeriod ?? 9;
    const longWindow = params.long_window ?? params.longPeriod ?? 21;
    const qty = params.quantity ?? 1;
    const stopLossPct = params.stop_loss_pct ?? params.stopLossPct ?? 2;
    const targetPct = params.target_pct ?? params.targetPct ?? 5;

    if (candles.length < longWindow + 2) return null;

    const closes = candles.map((c) => c.close);
    const shortMa = calculateSMA(closes, shortWindow);
    const longMa = calculateSMA(closes, longWindow);
    const i = closes.length - 1;
    const p = i - 1;

    if (
      Number.isNaN(shortMa[i]) ||
      Number.isNaN(longMa[i]) ||
      Number.isNaN(shortMa[p]) ||
      Number.isNaN(longMa[p])
    ) {
      return null;
    }

    const price = closes[i];
    const ts = candles[i].date;

    if (shortMa[p] <= longMa[p] && shortMa[i] > longMa[i]) {
      return {
        strategyName: this.name,
        symbol,
        signalType: "BUY",
        price,
        timestamp: ts,
        quantity: qty,
        confidence: 0.72,
        indicatorsUsed: {
          shortMa: shortMa[i],
          longMa: longMa[i],
          shortWindow,
          longWindow,
        },
        reason: `Short MA (${shortWindow}) crossed above long MA (${longWindow})`,
        stopLoss: price * (1 - stopLossPct / 100),
        target: price * (1 + targetPct / 100),
      };
    }

    if (shortMa[p] >= longMa[p] && shortMa[i] < longMa[i]) {
      return {
        strategyName: this.name,
        symbol,
        signalType: "EXIT",
        price,
        timestamp: ts,
        quantity: qty,
        confidence: 0.72,
        indicatorsUsed: { shortMa: shortMa[i], longMa: longMa[i] },
        reason: `Short MA crossed below long MA`,
      };
    }

    return null;
  }
}

export const movingAverageCrossover = new MovingAverageCrossoverStrategy();
