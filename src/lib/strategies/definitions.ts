import {
  TrendingUp,
  Activity,
  BarChart3,
  LineChart,
  Layers,
  ArrowUpDown,
  Gauge,
  Crosshair,
  Waves,
  Sparkles,
  Box,
  RotateCcw,
} from "lucide-react";

export type StrategyType =
  | "sma"
  | "ema"
  | "rsi"
  | "macd"
  | "bollinger"
  | "supertrend"
  | "stochastic"
  | "adx"
  | "vwap"
  | "golden_cross"
  | "breakout"
  | "mean_reversion";

export type Timeframe = "1min" | "5min" | "15min" | "30min" | "1hr" | "Day";

export type RiskLevel = "Low" | "Medium" | "High";

export interface StrategyParam {
  label: string;
  key: string;
  defaultValue: number;
}

export interface StrategyDefinition {
  id: StrategyType;
  name: string;
  description: string;
  icon: React.ElementType;
  params: StrategyParam[];
  category: "basic" | "advanced";
  /** Historical backtest win rate — educational only, not a guarantee */
  winRate: number;
  riskLevel: RiskLevel;
  bestFor: string;
  feedback: string;
}

export const STRATEGY_DEFINITIONS: StrategyDefinition[] = [
  {
    id: "sma",
    name: "SMA Crossover",
    description: "Buy when short SMA crosses above long SMA",
    icon: TrendingUp,
    category: "basic",
    winRate: 52,
    riskLevel: "Medium",
    bestFor: "Trending markets",
    feedback: "Simple and reliable; lags in choppy sideways markets.",
    params: [
      { label: "Short Period", key: "shortPeriod", defaultValue: 9 },
      { label: "Long Period", key: "longPeriod", defaultValue: 21 },
    ],
  },
  {
    id: "ema",
    name: "EMA Crossover",
    description: "Faster response using exponential moving averages",
    icon: Activity,
    category: "basic",
    winRate: 54,
    riskLevel: "Medium",
    bestFor: "Momentum swings",
    feedback: "Reacts faster than SMA; more false signals in range-bound stocks.",
    params: [
      { label: "Short Period", key: "shortPeriod", defaultValue: 9 },
      { label: "Long Period", key: "longPeriod", defaultValue: 21 },
    ],
  },
  {
    id: "rsi",
    name: "RSI Strategy",
    description: "Buy at oversold (30), sell at overbought (70)",
    icon: BarChart3,
    category: "basic",
    winRate: 48,
    riskLevel: "Medium",
    bestFor: "Range-bound / mean-reverting stocks",
    feedback: "Works well in sideways markets; weak in strong trends.",
    params: [
      { label: "Period", key: "period", defaultValue: 14 },
      { label: "Oversold", key: "oversold", defaultValue: 30 },
      { label: "Overbought", key: "overbought", defaultValue: 70 },
    ],
  },
  {
    id: "macd",
    name: "MACD Crossover",
    description: "Signal line crossover for trend detection",
    icon: LineChart,
    category: "basic",
    winRate: 51,
    riskLevel: "Medium",
    bestFor: "Medium-term trends",
    feedback: "Good trend filter; combine with volume for fewer whipsaws.",
    params: [
      { label: "Fast", key: "fast", defaultValue: 12 },
      { label: "Slow", key: "slow", defaultValue: 26 },
      { label: "Signal", key: "signal", defaultValue: 9 },
    ],
  },
  {
    id: "bollinger",
    name: "Bollinger Bands",
    description: "Trade at band touches for mean reversion",
    icon: Layers,
    category: "basic",
    winRate: 49,
    riskLevel: "Medium",
    bestFor: "Volatile range-bound stocks",
    feedback: "Mean reversion at bands; avoid during strong breakouts.",
    params: [
      { label: "Period", key: "period", defaultValue: 20 },
      { label: "Multiplier", key: "multiplier", defaultValue: 2 },
    ],
  },
  {
    id: "supertrend",
    name: "Supertrend",
    description: "ATR-based trend follower with clear buy/sell flips",
    icon: ArrowUpDown,
    category: "advanced",
    winRate: 56,
    riskLevel: "Medium",
    bestFor: "Strong directional trends",
    feedback: "Popular for swing trades; late entries but good trend capture.",
    params: [
      { label: "ATR Period", key: "atrPeriod", defaultValue: 10 },
      { label: "Multiplier", key: "multiplier", defaultValue: 3 },
    ],
  },
  {
    id: "stochastic",
    name: "Stochastic Oscillator",
    description: "%K/%D crossovers in overbought and oversold zones",
    icon: Gauge,
    category: "advanced",
    winRate: 47,
    riskLevel: "High",
    bestFor: "Short-term reversals",
    feedback: "Sensitive on lower timeframes; pair with higher-TF trend filter.",
    params: [
      { label: "%K Period", key: "kPeriod", defaultValue: 14 },
      { label: "%D Period", key: "dPeriod", defaultValue: 3 },
      { label: "Oversold", key: "oversold", defaultValue: 20 },
      { label: "Overbought", key: "overbought", defaultValue: 80 },
    ],
  },
  {
    id: "adx",
    name: "ADX Trend Strength",
    description: "Trade only when ADX confirms a strong trend",
    icon: Crosshair,
    category: "advanced",
    winRate: 55,
    riskLevel: "Low",
    bestFor: "Filtering weak signals",
    feedback: "ADX does not show direction — use with MA or price action.",
    params: [
      { label: "ADX Period", key: "period", defaultValue: 14 },
      { label: "Min ADX", key: "minAdx", defaultValue: 25 },
    ],
  },
  {
    id: "vwap",
    name: "VWAP Reversion",
    description: "Buy below VWAP, sell above — intraday institutional anchor",
    icon: Waves,
    category: "advanced",
    winRate: 53,
    riskLevel: "Medium",
    bestFor: "Intraday (MIS) liquid large-caps",
    feedback: "Institutions watch VWAP; best on 5–15 min with high volume.",
    params: [
      { label: "Deviation %", key: "deviation", defaultValue: 0.5 },
      { label: "Lookback", key: "lookback", defaultValue: 20 },
    ],
  },
  {
    id: "golden_cross",
    name: "Golden / Death Cross",
    description: "50/200 MA cross for long-term trend shifts",
    icon: Sparkles,
    category: "advanced",
    winRate: 58,
    riskLevel: "Low",
    bestFor: "Positional / swing (daily)",
    feedback: "Fewer signals but higher conviction; slow to react.",
    params: [
      { label: "Fast MA", key: "fastMa", defaultValue: 50 },
      { label: "Slow MA", key: "slowMa", defaultValue: 200 },
    ],
  },
  {
    id: "breakout",
    name: "Price Breakout",
    description: "Enter on break above N-day high with volume confirmation",
    icon: Box,
    category: "advanced",
    winRate: 50,
    riskLevel: "High",
    bestFor: "Momentum breakouts",
    feedback: "High reward potential; many false breakouts without volume filter.",
    params: [
      { label: "Lookback Days", key: "lookback", defaultValue: 20 },
      { label: "Volume Multiplier", key: "volumeMult", defaultValue: 1.5 },
    ],
  },
  {
    id: "mean_reversion",
    name: "Mean Reversion (Z-Score)",
    description: "Fade extreme moves when price deviates from rolling mean",
    icon: RotateCcw,
    category: "advanced",
    winRate: 46,
    riskLevel: "High",
    bestFor: "Range-bound large caps",
    feedback: "Dangerous in trends; tighten stops when ADX rises.",
    params: [
      { label: "Lookback", key: "lookback", defaultValue: 20 },
      { label: "Z Entry", key: "zEntry", defaultValue: 2 },
    ],
  },
];

export const TIMEFRAMES: Timeframe[] = ["1min", "5min", "15min", "30min", "1hr", "Day"];

export function getDefaultParams(def: StrategyDefinition): Record<string, number> {
  return Object.fromEntries(def.params.map((p) => [p.key, p.defaultValue]));
}

export function getStrategyDef(type: StrategyType): StrategyDefinition {
  return STRATEGY_DEFINITIONS.find((d) => d.id === type) ?? STRATEGY_DEFINITIONS[0];
}

export function inferStrategyType(name: string): StrategyType {
  const exact = STRATEGY_DEFINITIONS.find(
    (d) => d.name.toLowerCase() === name.toLowerCase()
  );
  if (exact) return exact.id;

  const n = name.toLowerCase();
  if (n.includes("supertrend")) return "supertrend";
  if (n.includes("stochastic")) return "stochastic";
  if (n.includes("adx")) return "adx";
  if (n.includes("vwap")) return "vwap";
  if (n.includes("golden") || n.includes("death cross")) return "golden_cross";
  if (n.includes("breakout")) return "breakout";
  if (n.includes("mean reversion") || n.includes("z-score")) return "mean_reversion";
  if (n.includes("bollinger")) return "bollinger";
  if (n.includes("macd")) return "macd";
  if (n.includes("rsi")) return "rsi";
  if (n.includes("ema")) return "ema";
  if (n.includes("sma")) return "sma";
  return "sma";
}
