import type { OHLC } from "@/types";
import type { AppSettings } from "@/lib/firebase";
import type { StrategyType } from "@/lib/strategies/definitions";
import { inferStrategyType } from "@/lib/strategies/definitions";
import { rsiStrategy } from "@/lib/strategies/index";
import type { PaperPosition, StrategyOpinion } from "@/lib/portfolio/types";

export type EntryArchetype =
  | "MOMENTUM_BREAKOUT"
  | "TREND_FOLLOWING"
  | "MEAN_REVERSION";

const MOMENTUM_TYPES = new Set<StrategyType>(["breakout", "ema"]);
const TREND_TYPES = new Set<StrategyType>([
  "sma",
  "macd",
  "supertrend",
  "adx",
  "golden_cross",
]);
const REVERSION_TYPES = new Set<StrategyType>([
  "rsi",
  "bollinger",
  "stochastic",
  "vwap",
  "mean_reversion",
]);

const MOMENTUM_EXIT_TYPES = new Set<StrategyType>([
  ...MOMENTUM_TYPES,
  ...TREND_TYPES,
  "rsi",
]);

const TREND_EXIT_TYPES = new Set<StrategyType>([
  ...TREND_TYPES,
  ...MOMENTUM_TYPES,
]);

const REVERSION_EXIT_TYPES = new Set<StrategyType>([...REVERSION_TYPES]);

export function getEntryArchetype(type: StrategyType): EntryArchetype {
  if (MOMENTUM_TYPES.has(type)) return "MOMENTUM_BREAKOUT";
  if (REVERSION_TYPES.has(type)) return "MEAN_REVERSION";
  return "TREND_FOLLOWING";
}

export function resolveEntryArchetype(
  position: Pick<
    PaperPosition,
    "ownerEntryArchetype" | "ownerStrategyType" | "ownerStrategyName"
  >
): EntryArchetype {
  if (position.ownerEntryArchetype) return position.ownerEntryArchetype;
  const type =
    position.ownerStrategyType ??
    (position.ownerStrategyName
      ? inferStrategyType(position.ownerStrategyName)
      : "sma");
  return getEntryArchetype(type);
}

export function isExitCompatible(
  entry: EntryArchetype,
  sellType: StrategyType
): boolean {
  switch (entry) {
    case "MOMENTUM_BREAKOUT":
      return MOMENTUM_EXIT_TYPES.has(sellType);
    case "TREND_FOLLOWING":
      return TREND_EXIT_TYPES.has(sellType);
    case "MEAN_REVERSION":
      return REVERSION_EXIT_TYPES.has(sellType);
  }
}

export function getDynamicExitParams(
  entry: EntryArchetype,
  sellType: StrategyType,
  baseParams: Record<string, number>,
  settings: Pick<AppSettings, "momentumRsiOverbought">
): Record<string, number> {
  if (sellType !== "rsi") return baseParams;
  if (entry === "MOMENTUM_BREAKOUT") {
    return {
      ...baseParams,
      overbought: settings.momentumRsiOverbought ?? 85,
    };
  }
  return baseParams;
}

/** Re-evaluate RSI SELL with entry-aware overbought threshold. */
export function rsiSellValidForEntry(
  bars: OHLC[],
  entry: EntryArchetype,
  baseParams: Record<string, number>,
  settings: Pick<AppSettings, "momentumRsiOverbought">
): boolean {
  const params = getDynamicExitParams(entry, "rsi", baseParams, settings);
  const signal = rsiStrategy.evaluate(bars, params);
  return signal?.action === "SELL";
}

export function resolveOpinionStrategyType(
  op: StrategyOpinion,
  typeByStrategyId?: Map<string, StrategyType>
): StrategyType {
  if (op.strategyType) return op.strategyType;
  const fromId = typeByStrategyId?.get(op.strategyId);
  if (fromId) return fromId;
  return inferStrategyType(op.strategyName);
}

function symKey(symbol: string, exchange: string): string {
  return `${symbol.trim().toUpperCase()}:${(exchange || "NSE").trim().toUpperCase()}`;
}

/** Filter + validate sell opinions for a held position (entry-connected exits). */
export function filterCompatibleSellOpinions(
  opinions: StrategyOpinion[],
  position: PaperPosition,
  settings: Pick<AppSettings, "momentumRsiOverbought" | "enableEntryConnectedExits">,
  options?: {
    bars?: OHLC[];
    strategyParamsById?: Map<string, Record<string, number>>;
    typeByStrategyId?: Map<string, StrategyType>;
  }
): StrategyOpinion[] {
  if (settings.enableEntryConnectedExits === false) {
    return opinions.filter((o) => o.action === "SELL");
  }

  const entry = resolveEntryArchetype(position);
  const key = symKey(position.symbol, position.exchange);

  return opinions.filter((op) => {
    if (op.action !== "SELL") return false;
    if (symKey(op.symbol, op.exchange) !== key) return false;

    const sellType = resolveOpinionStrategyType(op, options?.typeByStrategyId);
    if (!isExitCompatible(entry, sellType)) return false;

    if (sellType === "rsi" && options?.bars) {
      const params =
        options.strategyParamsById?.get(op.strategyId) ?? {
          period: 14,
          oversold: 30,
          overbought: 70,
          quantity: 1,
        };
      return rsiSellValidForEntry(options.bars, entry, params, settings);
    }

    return true;
  });
}

/** Per-symbol consolidated sell opinions respecting entry compatibility. */
export function consolidateCompatibleSellOpinions(
  opinions: StrategyOpinion[],
  position: PaperPosition,
  settings: Pick<
    AppSettings,
    "momentumRsiOverbought" | "enableEntryConnectedExits"
  >,
  options?: {
    bars?: OHLC[];
    strategyParamsById?: Map<string, Record<string, number>>;
    typeByStrategyId?: Map<string, StrategyType>;
  }
): StrategyOpinion[] {
  const compatible = filterCompatibleSellOpinions(
    opinions,
    position,
    settings,
    options
  );
  if (compatible.length === 0) return [];

  const sellCounts = new Map<string, number>();
  const sellStrategyNames = new Map<string, string[]>();
  const confidenceSums = new Map<string, number>();
  const bestSell = new Map<string, StrategyOpinion>();

  for (const op of compatible) {
    const key = symKey(op.symbol, op.exchange);
    sellCounts.set(key, (sellCounts.get(key) ?? 0) + 1);
    confidenceSums.set(key, (confidenceSums.get(key) ?? 0) + (op.confidence ?? 0));
    const names = sellStrategyNames.get(key) ?? [];
    if (!names.includes(op.strategyName)) names.push(op.strategyName);
    sellStrategyNames.set(key, names);
    const existing = bestSell.get(key);
    if (!existing || op.confidence > existing.confidence) {
      bestSell.set(key, op);
    }
  }

  return [...bestSell.values()].map((op) => {
    const key = symKey(op.symbol, op.exchange);
    const confidenceSum = confidenceSums.get(key) ?? op.confidence;
    return {
      ...op,
      sellSignalCount: sellCounts.get(key) ?? 1,
      signalStrategyNames: sellStrategyNames.get(key) ?? [op.strategyName],
      confidenceSum,
      scanConfidence: confidenceSum,
    };
  });
}
