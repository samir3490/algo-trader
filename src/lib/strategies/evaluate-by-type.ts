import type { OHLC, StrategySignal } from "@/types";
import { calculateSMA, calculateEMA, calculateRSI, calculateBollingerBands } from "@/lib/utils";
import {
  smaCrossover,
  emaCrossover,
  rsiStrategy,
  macdStrategy,
  bollingerBandsStrategy,
} from "@/lib/strategies/index";
import type { StrategyType } from "@/lib/strategies/definitions";

function withSymbol(signal: StrategySignal | null, symbol: string): StrategySignal | null {
  if (!signal) return null;
  return { ...signal, symbol };
}

function engineEvaluate(
  engineId: string,
  data: OHLC[],
  params: Record<string, number>
): StrategySignal | null {
  const p = { quantity: params.quantity ?? 1, ...params };
  switch (engineId) {
    case "SMA_CROSSOVER":
      return smaCrossover.evaluate(data, p);
    case "EMA_CROSSOVER":
      return emaCrossover.evaluate(data, p);
    case "RSI":
      return rsiStrategy.evaluate(data, p);
    case "MACD":
      return macdStrategy.evaluate(data, p);
    case "BOLLINGER_BANDS":
      return bollingerBandsStrategy.evaluate(data, p);
    default:
      return null;
  }
}

function evaluateGoldenCross(data: OHLC[], params: Record<string, number>): StrategySignal | null {
  const fast = params.fastMa ?? 50;
  const slow = params.slowMa ?? 200;
  if (data.length < slow + 2) return null;
  const closes = data.map((d) => d.close);
  const fastMa = calculateSMA(closes, fast);
  const slowMa = calculateSMA(closes, slow);
  const i = closes.length - 1;
  const p = i - 1;
  if (fastMa[p] <= slowMa[p] && fastMa[i] > slowMa[i]) {
    return {
      symbol: "",
      action: "BUY",
      price: closes[i],
      quantity: params.quantity ?? 1,
      reason: `Golden cross: ${fast} MA crossed above ${slow} MA`,
      confidence: 0.75,
      timestamp: data[i].date,
    };
  }
  if (fastMa[p] >= slowMa[p] && fastMa[i] < slowMa[i]) {
    return {
      symbol: "",
      action: "SELL",
      price: closes[i],
      quantity: params.quantity ?? 1,
      reason: `Death cross: ${fast} MA crossed below ${slow} MA`,
      confidence: 0.75,
      timestamp: data[i].date,
    };
  }
  return null;
}

function evaluateBreakout(data: OHLC[], params: Record<string, number>): StrategySignal | null {
  const lookback = params.lookback ?? 20;
  if (data.length < lookback + 2) return null;
  const closes = data.map((d) => d.close);
  const volumes = data.map((d) => d.volume);
  const i = closes.length - 1;
  const window = closes.slice(i - lookback, i);
  const volAvg = volumes.slice(i - lookback, i).reduce((a, b) => a + b, 0) / lookback;
  const high = Math.max(...window);
  const mult = params.volumeMult ?? 1.5;
  if (closes[i] > high && volumes[i] >= volAvg * mult) {
    return {
      symbol: "",
      action: "BUY",
      price: closes[i],
      quantity: params.quantity ?? 1,
      reason: `Breakout above ${lookback}-bar high with volume confirmation`,
      confidence: 0.65,
      timestamp: data[i].date,
    };
  }
  if (closes[i] < Math.min(...window)) {
    return {
      symbol: "",
      action: "SELL",
      price: closes[i],
      quantity: params.quantity ?? 1,
      reason: `Breakdown below ${lookback}-bar low`,
      confidence: 0.6,
      timestamp: data[i].date,
    };
  }
  return null;
}

function evaluateMeanReversion(data: OHLC[], params: Record<string, number>): StrategySignal | null {
  const lookback = params.lookback ?? 20;
  const zEntry = params.zEntry ?? 2;
  if (data.length < lookback + 1) return null;
  const closes = data.map((d) => d.close);
  const i = closes.length - 1;
  const slice = closes.slice(i - lookback + 1, i + 1);
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
  const std = Math.sqrt(variance) || 1;
  const z = (closes[i] - mean) / std;
  if (z <= -zEntry) {
    return {
      symbol: "",
      action: "BUY",
      price: closes[i],
      quantity: params.quantity ?? 1,
      reason: `Mean reversion: Z-score ${z.toFixed(2)} (oversold)`,
      confidence: 0.6,
      timestamp: data[i].date,
    };
  }
  if (z >= zEntry) {
    return {
      symbol: "",
      action: "SELL",
      price: closes[i],
      quantity: params.quantity ?? 1,
      reason: `Mean reversion: Z-score ${z.toFixed(2)} (overbought)`,
      confidence: 0.6,
      timestamp: data[i].date,
    };
  }
  return null;
}

function evaluateSupertrend(data: OHLC[], params: Record<string, number>): StrategySignal | null {
  const period = params.atrPeriod ?? 10;
  const mult = params.multiplier ?? 3;
  if (data.length < period + 2) return null;
  const closes = data.map((d) => d.close);
  const i = closes.length - 1;
  const hl2 = (data[i].high + data[i].low) / 2;
  let atr = 0;
  for (let j = i - period + 1; j <= i; j++) {
    const prevClose = j > 0 ? data[j - 1].close : data[j].close;
    const tr = Math.max(
      data[j].high - data[j].low,
      Math.abs(data[j].high - prevClose),
      Math.abs(data[j].low - prevClose)
    );
    atr += tr;
  }
  atr /= period;
  const upper = hl2 + mult * atr;
  const lower = hl2 - mult * atr;
  if (closes[i] > upper) {
    return {
      symbol: "",
      action: "BUY",
      price: closes[i],
      quantity: params.quantity ?? 1,
      reason: "Supertrend bullish (price above upper band)",
      confidence: 0.65,
      timestamp: data[i].date,
    };
  }
  if (closes[i] < lower) {
    return {
      symbol: "",
      action: "SELL",
      price: closes[i],
      quantity: params.quantity ?? 1,
      reason: "Supertrend bearish (price below lower band)",
      confidence: 0.65,
      timestamp: data[i].date,
    };
  }
  return null;
}

function evaluateStochastic(data: OHLC[], params: Record<string, number>): StrategySignal | null {
  const kPeriod = params.kPeriod ?? 14;
  const oversold = params.oversold ?? 20;
  const overbought = params.overbought ?? 80;
  if (data.length < kPeriod + 2) return null;
  const i = data.length - 1;
  const slice = data.slice(i - kPeriod + 1, i + 1);
  const low = Math.min(...slice.map((b) => b.low));
  const high = Math.max(...slice.map((b) => b.high));
  const k = high === low ? 50 : ((data[i].close - low) / (high - low)) * 100;
  const prevSlice = data.slice(i - kPeriod, i);
  const prevLow = Math.min(...prevSlice.map((b) => b.low));
  const prevHigh = Math.max(...prevSlice.map((b) => b.high));
  const prevK =
    prevHigh === prevLow ? 50 : ((data[i - 1].close - prevLow) / (prevHigh - prevLow)) * 100;
  if (prevK <= oversold && k > oversold) {
    return {
      symbol: "",
      action: "BUY",
      price: data[i].close,
      quantity: params.quantity ?? 1,
      reason: `Stochastic crossed up from oversold (${k.toFixed(0)})`,
      confidence: 0.6,
      timestamp: data[i].date,
    };
  }
  if (prevK >= overbought && k < overbought) {
    return {
      symbol: "",
      action: "SELL",
      price: data[i].close,
      quantity: params.quantity ?? 1,
      reason: `Stochastic crossed down from overbought (${k.toFixed(0)})`,
      confidence: 0.6,
      timestamp: data[i].date,
    };
  }
  return null;
}

function evaluateAdx(data: OHLC[], params: Record<string, number>): StrategySignal | null {
  const period = params.period ?? 14;
  const minAdx = params.minAdx ?? 25;
  if (data.length < period * 2) return null;
  const closes = data.map((d) => d.close);
  const ema = calculateEMA(closes, period);
  const i = closes.length - 1;
  let sumDm = 0;
  let sumTr = 0;
  for (let j = i - period + 1; j <= i; j++) {
    const up = data[j].high - data[j - 1].high;
    const down = data[j - 1].low - data[j].low;
    sumDm += Math.abs(up - down);
    sumTr += Math.max(
      data[j].high - data[j].low,
      Math.abs(data[j].high - data[j - 1].close),
      Math.abs(data[j].low - data[j - 1].close)
    );
  }
  const adxProxy = sumTr > 0 ? (sumDm / sumTr) * 100 : 0;
  if (adxProxy < minAdx) return null;
  if (closes[i] > ema[i] && closes[i - 1] <= ema[i - 1]) {
    return {
      symbol: "",
      action: "BUY",
      price: closes[i],
      quantity: params.quantity ?? 1,
      reason: `ADX trend strong (${adxProxy.toFixed(0)}) + price crossed EMA`,
      confidence: 0.65,
      timestamp: data[i].date,
    };
  }
  if (closes[i] < ema[i] && closes[i - 1] >= ema[i - 1]) {
    return {
      symbol: "",
      action: "SELL",
      price: closes[i],
      quantity: params.quantity ?? 1,
      reason: `ADX trend strong (${adxProxy.toFixed(0)}) + price below EMA`,
      confidence: 0.65,
      timestamp: data[i].date,
    };
  }
  return null;
}

function evaluateVwap(data: OHLC[], params: Record<string, number>): StrategySignal | null {
  const lookback = Math.min(params.lookback ?? 20, data.length);
  if (lookback < 5) return null;
  const slice = data.slice(-lookback);
  let cumTpV = 0;
  let cumV = 0;
  for (const b of slice) {
    const tp = (b.high + b.low + b.close) / 3;
    cumTpV += tp * b.volume;
    cumV += b.volume;
  }
  const vwap = cumV > 0 ? cumTpV / cumV : slice[slice.length - 1].close;
  const last = slice[slice.length - 1];
  const dev = params.deviation ?? 0.5;
  const pct = (dev / 100) * vwap;
  if (last.close < vwap - pct) {
    return {
      symbol: "",
      action: "BUY",
      price: last.close,
      quantity: params.quantity ?? 1,
      reason: `Price below VWAP (${vwap.toFixed(2)})`,
      confidence: 0.6,
      timestamp: last.date,
    };
  }
  if (last.close > vwap + pct) {
    return {
      symbol: "",
      action: "SELL",
      price: last.close,
      quantity: params.quantity ?? 1,
      reason: `Price above VWAP (${vwap.toFixed(2)})`,
      confidence: 0.6,
      timestamp: last.date,
    };
  }
  return null;
}

export function evaluateStrategyByType(
  type: StrategyType,
  data: OHLC[],
  params: Record<string, number>,
  symbol: string
): StrategySignal | null {
  const p = { quantity: 1, ...params };
  let signal: StrategySignal | null = null;

  switch (type) {
    case "sma":
      signal = engineEvaluate("SMA_CROSSOVER", data, p);
      break;
    case "ema":
      signal = engineEvaluate("EMA_CROSSOVER", data, p);
      break;
    case "rsi":
      signal = engineEvaluate("RSI", data, p);
      break;
    case "macd":
      signal = engineEvaluate("MACD", data, p);
      break;
    case "bollinger":
      signal = engineEvaluate("BOLLINGER_BANDS", data, p);
      break;
    case "golden_cross":
      signal = evaluateGoldenCross(data, p);
      break;
    case "breakout":
      signal = evaluateBreakout(data, p);
      break;
    case "mean_reversion":
      signal = evaluateMeanReversion(data, p);
      break;
    case "supertrend":
      signal = evaluateSupertrend(data, p);
      break;
    case "stochastic":
      signal = evaluateStochastic(data, p);
      break;
    case "adx":
      signal = evaluateAdx(data, p);
      break;
    case "vwap":
      signal = evaluateVwap(data, p);
      break;
    default:
      return null;
  }

  return withSymbol(signal, symbol);
}
