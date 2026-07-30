import type { OHLC } from "@/types";
import { fetchYahooHistory, type ChartTimeframe } from "@/lib/market-data/history";
import { computeATR } from "@/lib/market-data/atr";
import { resolvePaperExecutionPrice } from "@/lib/market-data/resolve-execution-price";
import { evaluateStrategyByType } from "@/lib/strategies/evaluate-by-type";
import { inferStrategyType, type StrategyType } from "@/lib/strategies/definitions";
import { resolveStrategyScanSymbols } from "@/lib/universe/scan-expand";

export interface StrategyScanInput {
  id: string;
  name: string;
  symbol: string;
  exchange: string;
  timeframe: string;
  mode: "paper" | "live";
  status: string;
  params: Record<string, number>;
  type?: StrategyType;
  symbols?: string[];
  universe?: "nifty50" | "banknifty" | "top100" | "custom";
  universeTopN?: number;
}

export interface ScanSignal {
  strategyId: string;
  strategyType?: StrategyType;
  symbol: string;
  action: string;
  price: number;
  reason: string;
  confidence: number;
  /** ATR at signal time — used for volatility-based sizing. */
  atr?: number;
}

export async function scanStrategiesForSignals(
  strategies: StrategyScanInput[],
  options?: { atrPeriod?: number }
): Promise<{ scanned: number; signals: ScanSignal[] }> {
  const running = strategies.filter((s) => s.status === "running");
  const results: ScanSignal[] = [];
  const historyCache = new Map<string, OHLC[]>();
  const atrPeriod = options?.atrPeriod ?? 14;

  for (const strat of running) {
    const type = strat.type ?? inferStrategyType(strat.name);
    const tf = (strat.timeframe || "Day") as ChartTimeframe;
    const symbols = resolveStrategyScanSymbols(strat);
    const batch: ScanSignal[] = [];

    for (const sym of symbols) {
      const cacheKey = `${strat.exchange}:${sym}:${tf}`;
      let bars = historyCache.get(cacheKey);
      if (!bars) {
        bars = await fetchYahooHistory(sym, strat.exchange || "NSE", tf);
        historyCache.set(cacheKey, bars);
      }
      if (bars.length < 30) continue;

      const signal = evaluateStrategyByType(type, bars, strat.params ?? {}, sym);
      if (!signal || signal.action === "HOLD") continue;

      // Prefer live quote, but never drop a signal if Yahoo quote fails —
      // execution path re-resolves price before fill.
      const resolved = await resolvePaperExecutionPrice(
        sym,
        strat.exchange || "NSE",
        signal.price,
        { requireLive: false }
      );
      const price =
        resolved?.price && resolved.price > 0 ? resolved.price : signal.price;
      if (!Number.isFinite(price) || price <= 0) continue;

      const atr = computeATR(bars, atrPeriod) ?? undefined;

      batch.push({
        strategyId: strat.id,
        strategyType: type as StrategyType,
        symbol: sym,
        action: signal.action,
        price,
        reason: signal.reason,
        confidence: signal.confidence,
        atr,
      });
    }

    results.push(...batch);
  }

  return { scanned: running.length, signals: results };
}

/** ATR for sizing — prefer owner strategy signal, else any BUY on symbol. */
export function resolveSignalAtrForSymbol(
  signals: ScanSignal[],
  symbol: string,
  ownerStrategyId?: string
): number | undefined {
  const sym = symbol.toUpperCase();
  const hasAtr = (s: ScanSignal) =>
    s.action === "BUY" &&
    s.symbol.toUpperCase() === sym &&
    s.atr != null &&
    s.atr > 0;

  if (ownerStrategyId) {
    const owned = signals.find(
      (s) => hasAtr(s) && s.strategyId === ownerStrategyId
    )?.atr;
    if (owned != null) return owned;
  }

  return signals.find(hasAtr)?.atr;
}

export async function fetchSymbolAtr(
  symbol: string,
  exchange: string,
  period = 14
): Promise<number | undefined> {
  const bars = await fetchYahooHistory(symbol, exchange, "Day");
  return computeATR(bars, period) ?? undefined;
}
