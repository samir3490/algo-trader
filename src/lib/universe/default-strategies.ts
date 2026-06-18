import type { ActiveStrategy } from "@/lib/firebase";
import {
  getDefaultParams,
  STRATEGY_DEFINITIONS,
} from "@/lib/strategies/definitions";
import {
  BANK_NIFTY_SYMBOLS,
  NIFTY50_SYMBOLS,
  TOP100_SYMBOLS,
  type UniversePreset,
} from "@/lib/universe/symbol-lists";

export interface BuildUniverseStrategiesOptions {
  mode?: "paper" | "live";
  timeframe?: string;
  universe?: UniversePreset;
  /** Only include these strategy definition ids; default = all 12. */
  strategyIds?: string[];
}

function symbolsForUniverse(universe: UniversePreset): string[] {
  if (universe === "banknifty") return [...BANK_NIFTY_SYMBOLS];
  if (universe === "top100") return [...TOP100_SYMBOLS];
  return [...NIFTY50_SYMBOLS];
}

/** One running instance per strategy type — scans full list (no per-symbol rows). */
export function buildNifty50UniverseStrategies(
  options?: BuildUniverseStrategiesOptions
): ActiveStrategy[] {
  const universe = options?.universe ?? "nifty50";
  const symbols = symbolsForUniverse(universe);

  const defs = options?.strategyIds?.length
    ? STRATEGY_DEFINITIONS.filter((d) => options.strategyIds!.includes(d.id))
    : STRATEGY_DEFINITIONS;

  const now = new Date().toISOString();
  const stamp = Date.now();

  return defs.map((def, i) => ({
    id: `universe-${def.id}-${stamp}-${i}`,
    name: def.name,
    symbol: symbols[0] ?? "RELIANCE",
    symbols: [...symbols],
    universe,
    exchange: "NSE",
    timeframe: options?.timeframe ?? "Day",
    mode: options?.mode ?? "paper",
    status: "running" as const,
    params: getDefaultParams(def),
    createdAt: now,
    signals: 0,
    pnl: 0,
  }));
}
