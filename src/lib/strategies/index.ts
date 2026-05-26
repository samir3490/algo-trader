import type { OHLC, StrategySignal, StrategyConfig } from "@/types";
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
} from "@/lib/utils";

export interface StrategyDefinition {
  id: string;
  name: string;
  description: string;
  defaultParams: Record<string, number>;
  paramLabels: Record<string, string>;
  evaluate: (data: OHLC[], params: Record<string, number>) => StrategySignal | null;
}

export const smaCrossover: StrategyDefinition = {
  id: "SMA_CROSSOVER",
  name: "SMA Crossover",
  description:
    "Generates buy signal when short-period SMA crosses above long-period SMA, and sell when it crosses below.",
  defaultParams: { shortPeriod: 9, longPeriod: 21, quantity: 1 },
  paramLabels: {
    shortPeriod: "Short SMA Period",
    longPeriod: "Long SMA Period",
    quantity: "Quantity",
  },
  evaluate(data: OHLC[], params: Record<string, number>): StrategySignal | null {
    if (data.length < params.longPeriod + 1) return null;

    const closes = data.map((d) => d.close);
    const shortSMA = calculateSMA(closes, params.shortPeriod);
    const longSMA = calculateSMA(closes, params.longPeriod);

    const lastIdx = closes.length - 1;
    const prevIdx = lastIdx - 1;

    const currentShort = shortSMA[lastIdx];
    const currentLong = longSMA[lastIdx];
    const prevShort = shortSMA[prevIdx];
    const prevLong = longSMA[prevIdx];

    if (isNaN(currentShort) || isNaN(currentLong) || isNaN(prevShort) || isNaN(prevLong)) {
      return null;
    }

    if (prevShort <= prevLong && currentShort > currentLong) {
      return {
        symbol: "",
        action: "BUY",
        price: closes[lastIdx],
        quantity: params.quantity,
        reason: `Short SMA (${params.shortPeriod}) crossed above Long SMA (${params.longPeriod})`,
        confidence: 0.7,
        timestamp: data[lastIdx].date,
      };
    }

    if (prevShort >= prevLong && currentShort < currentLong) {
      return {
        symbol: "",
        action: "SELL",
        price: closes[lastIdx],
        quantity: params.quantity,
        reason: `Short SMA (${params.shortPeriod}) crossed below Long SMA (${params.longPeriod})`,
        confidence: 0.7,
        timestamp: data[lastIdx].date,
      };
    }

    return null;
  },
};

export const emaCrossover: StrategyDefinition = {
  id: "EMA_CROSSOVER",
  name: "EMA Crossover",
  description:
    "Uses Exponential Moving Averages for faster response to price changes. Buy when short EMA crosses above long EMA.",
  defaultParams: { shortPeriod: 9, longPeriod: 21, quantity: 1 },
  paramLabels: {
    shortPeriod: "Short EMA Period",
    longPeriod: "Long EMA Period",
    quantity: "Quantity",
  },
  evaluate(data: OHLC[], params: Record<string, number>): StrategySignal | null {
    if (data.length < params.longPeriod + 1) return null;

    const closes = data.map((d) => d.close);
    const shortEMA = calculateEMA(closes, params.shortPeriod);
    const longEMA = calculateEMA(closes, params.longPeriod);

    const lastIdx = closes.length - 1;
    const prevIdx = lastIdx - 1;

    const currentShort = shortEMA[lastIdx];
    const currentLong = longEMA[lastIdx];
    const prevShort = shortEMA[prevIdx];
    const prevLong = longEMA[prevIdx];

    if (isNaN(currentShort) || isNaN(currentLong) || isNaN(prevShort) || isNaN(prevLong)) {
      return null;
    }

    if (prevShort <= prevLong && currentShort > currentLong) {
      return {
        symbol: "",
        action: "BUY",
        price: closes[lastIdx],
        quantity: params.quantity,
        reason: `Short EMA (${params.shortPeriod}) crossed above Long EMA (${params.longPeriod})`,
        confidence: 0.75,
        timestamp: data[lastIdx].date,
      };
    }

    if (prevShort >= prevLong && currentShort < currentLong) {
      return {
        symbol: "",
        action: "SELL",
        price: closes[lastIdx],
        quantity: params.quantity,
        reason: `Short EMA (${params.shortPeriod}) crossed below Long EMA (${params.longPeriod})`,
        confidence: 0.75,
        timestamp: data[lastIdx].date,
      };
    }

    return null;
  },
};

export const rsiStrategy: StrategyDefinition = {
  id: "RSI",
  name: "RSI Overbought/Oversold",
  description:
    "Buy when RSI drops below oversold level (30) and sell when it rises above overbought level (70).",
  defaultParams: { period: 14, oversold: 30, overbought: 70, quantity: 1 },
  paramLabels: {
    period: "RSI Period",
    oversold: "Oversold Level",
    overbought: "Overbought Level",
    quantity: "Quantity",
  },
  evaluate(data: OHLC[], params: Record<string, number>): StrategySignal | null {
    if (data.length < params.period + 2) return null;

    const closes = data.map((d) => d.close);
    const rsi = calculateRSI(closes, params.period);

    const lastIdx = closes.length - 1;
    const prevIdx = lastIdx - 1;
    const currentRSI = rsi[lastIdx];
    const prevRSI = rsi[prevIdx];

    if (isNaN(currentRSI) || isNaN(prevRSI)) return null;

    if (prevRSI <= params.oversold && currentRSI > params.oversold) {
      return {
        symbol: "",
        action: "BUY",
        price: closes[lastIdx],
        quantity: params.quantity,
        reason: `RSI crossed above oversold (${params.oversold}). Current RSI: ${currentRSI.toFixed(1)}`,
        confidence: 0.65,
        timestamp: data[lastIdx].date,
      };
    }

    if (prevRSI >= params.overbought && currentRSI < params.overbought) {
      return {
        symbol: "",
        action: "SELL",
        price: closes[lastIdx],
        quantity: params.quantity,
        reason: `RSI crossed below overbought (${params.overbought}). Current RSI: ${currentRSI.toFixed(1)}`,
        confidence: 0.65,
        timestamp: data[lastIdx].date,
      };
    }

    return null;
  },
};

export const macdStrategy: StrategyDefinition = {
  id: "MACD",
  name: "MACD Crossover",
  description:
    "Buy when MACD line crosses above signal line, sell when it crosses below. Uses 12/26/9 as default periods.",
  defaultParams: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, quantity: 1 },
  paramLabels: {
    fastPeriod: "Fast EMA Period",
    slowPeriod: "Slow EMA Period",
    signalPeriod: "Signal Period",
    quantity: "Quantity",
  },
  evaluate(data: OHLC[], params: Record<string, number>): StrategySignal | null {
    if (data.length < params.slowPeriod + params.signalPeriod + 1) return null;

    const closes = data.map((d) => d.close);
    const { macd, signal } = calculateMACD(
      closes,
      params.fastPeriod,
      params.slowPeriod,
      params.signalPeriod
    );

    const lastIdx = macd.length - 1;
    const prevIdx = lastIdx - 1;

    if (isNaN(macd[lastIdx]) || isNaN(signal[lastIdx]) || isNaN(macd[prevIdx]) || isNaN(signal[prevIdx])) {
      return null;
    }

    if (macd[prevIdx] <= signal[prevIdx] && macd[lastIdx] > signal[lastIdx]) {
      return {
        symbol: "",
        action: "BUY",
        price: closes[lastIdx],
        quantity: params.quantity,
        reason: "MACD crossed above signal line (bullish crossover)",
        confidence: 0.7,
        timestamp: data[lastIdx].date,
      };
    }

    if (macd[prevIdx] >= signal[prevIdx] && macd[lastIdx] < signal[lastIdx]) {
      return {
        symbol: "",
        action: "SELL",
        price: closes[lastIdx],
        quantity: params.quantity,
        reason: "MACD crossed below signal line (bearish crossover)",
        confidence: 0.7,
        timestamp: data[lastIdx].date,
      };
    }

    return null;
  },
};

export const bollingerBandsStrategy: StrategyDefinition = {
  id: "BOLLINGER_BANDS",
  name: "Bollinger Bands",
  description:
    "Buy when price touches lower band (oversold), sell when price touches upper band (overbought).",
  defaultParams: { period: 20, multiplier: 2, quantity: 1 },
  paramLabels: {
    period: "Period",
    multiplier: "Std Dev Multiplier",
    quantity: "Quantity",
  },
  evaluate(data: OHLC[], params: Record<string, number>): StrategySignal | null {
    if (data.length < params.period + 1) return null;

    const closes = data.map((d) => d.close);
    const { upper, lower } = calculateBollingerBands(closes, params.period, params.multiplier);

    const lastIdx = closes.length - 1;
    const prevIdx = lastIdx - 1;

    if (isNaN(upper[lastIdx]) || isNaN(lower[lastIdx])) return null;

    if (closes[prevIdx] >= lower[prevIdx] && closes[lastIdx] < lower[lastIdx]) {
      return {
        symbol: "",
        action: "BUY",
        price: closes[lastIdx],
        quantity: params.quantity,
        reason: `Price touched lower Bollinger Band (${lower[lastIdx].toFixed(2)})`,
        confidence: 0.6,
        timestamp: data[lastIdx].date,
      };
    }

    if (closes[prevIdx] <= upper[prevIdx] && closes[lastIdx] > upper[lastIdx]) {
      return {
        symbol: "",
        action: "SELL",
        price: closes[lastIdx],
        quantity: params.quantity,
        reason: `Price touched upper Bollinger Band (${upper[lastIdx].toFixed(2)})`,
        confidence: 0.6,
        timestamp: data[lastIdx].date,
      };
    }

    return null;
  },
};

export const ALL_STRATEGIES: StrategyDefinition[] = [
  smaCrossover,
  emaCrossover,
  rsiStrategy,
  macdStrategy,
  bollingerBandsStrategy,
];

export function getStrategyById(id: string): StrategyDefinition | undefined {
  return ALL_STRATEGIES.find((s) => s.id === id);
}
