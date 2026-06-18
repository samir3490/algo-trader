import type { StrategyScanInput, ScanSignal } from "@/lib/strategies/scan-signals";
import {
  resolveUniverseSymbols,
  type UniversePreset,
} from "@/lib/universe/symbol-lists";

/** Symbols to evaluate for one strategy row (single or universe). */
export function resolveStrategyScanSymbols(strat: StrategyScanInput): string[] {
  const fromList = resolveUniverseSymbols(
    strat.universe as UniversePreset | undefined,
    strat.symbols
  );
  if (fromList.length > 0) return fromList;
  if (strat.symbols?.length) {
    return [...new Set(strat.symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  }
  return [strat.symbol.trim().toUpperCase()].filter(Boolean);
}

/** After fan-out, keep top N BUY signals by confidence per strategy instance. */
export function capUniverseBuySignals(
  signals: ScanSignal[],
  strategyId: string,
  topN: number
): ScanSignal[] {
  if (topN <= 0) return signals;

  const mine = signals.filter((s) => s.strategyId === strategyId);
  const rest = signals.filter((s) => s.strategyId !== strategyId);
  const buys = mine
    .filter((s) => s.action === "BUY")
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, topN);
  const sells = mine.filter((s) => s.action === "SELL");
  const holds = mine.filter((s) => s.action !== "BUY" && s.action !== "SELL");

  return [...rest, ...buys, ...sells, ...holds];
}
