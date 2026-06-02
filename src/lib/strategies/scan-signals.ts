import type { OHLC } from "@/types";
import { fetchYahooHistory, type ChartTimeframe } from "@/lib/market-data/history";
import { evaluateStrategyByType } from "@/lib/strategies/evaluate-by-type";
import { inferStrategyType, type StrategyType } from "@/lib/strategies/definitions";

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
}

export interface ScanSignal {
  strategyId: string;
  symbol: string;
  action: string;
  price: number;
  reason: string;
  confidence: number;
}

export async function scanStrategiesForSignals(
  strategies: StrategyScanInput[]
): Promise<{ scanned: number; signals: ScanSignal[] }> {
  const running = strategies.filter((s) => s.status === "running");
  const results: ScanSignal[] = [];
  const historyCache = new Map<string, OHLC[]>();

  for (const strat of running) {
    const type = strat.type ?? inferStrategyType(strat.name);
    const tf = (strat.timeframe || "Day") as ChartTimeframe;
    const cacheKey = `${strat.exchange}:${strat.symbol}:${tf}`;
    let bars = historyCache.get(cacheKey);
    if (!bars) {
      bars = await fetchYahooHistory(strat.symbol, strat.exchange || "NSE", tf);
      historyCache.set(cacheKey, bars);
    }
    if (bars.length < 30) continue;

    const signal = evaluateStrategyByType(type, bars, strat.params ?? {}, strat.symbol);
    if (signal && signal.action !== "HOLD") {
      results.push({
        strategyId: strat.id,
        symbol: strat.symbol,
        action: signal.action,
        price: signal.price,
        reason: signal.reason,
        confidence: signal.confidence,
      });
    }
  }

  return { scanned: running.length, signals: results };
}
