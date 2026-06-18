import type { OHLC } from "@/types";
import { fetchYahooHistory, type ChartTimeframe } from "@/lib/market-data/history";
import { computeATR } from "@/lib/market-data/atr";
import { resolvePaperExecutionPrice } from "@/lib/market-data/resolve-execution-price";
import { evaluateStrategyByType } from "@/lib/strategies/evaluate-by-type";
import { inferStrategyType, type StrategyType } from "@/lib/strategies/definitions";
import {
  capUniverseBuySignals,
  resolveStrategyScanSymbols,
} from "@/lib/universe/scan-expand";

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

      const resolved = await resolvePaperExecutionPrice(
        sym,
        strat.exchange || "NSE",
        signal.price,
        { requireLive: true }
      );
      if (!resolved) continue;

      const atr = computeATR(bars, atrPeriod) ?? undefined;

      batch.push({
        strategyId: strat.id,
        symbol: sym,
        action: signal.action,
        price: resolved.price,
        reason: signal.reason,
        confidence: signal.confidence,
        atr,
      });
    }

    const topN = strat.universeTopN ?? 0;
    if (topN > 0 && symbols.length > 1) {
      results.push(...capUniverseBuySignals(batch, strat.id, topN));
    } else {
      results.push(...batch);
    }
  }

  return { scanned: running.length, signals: results };
}
