import { NextRequest, NextResponse } from "next/server";
import type { OHLC } from "@/types";
import { fetchYahooHistory, type ChartTimeframe } from "@/lib/market-data/history";
import { evaluateStrategyByType } from "@/lib/strategies/evaluate-by-type";
import { inferStrategyType } from "@/lib/strategies/definitions";
import type { StrategyType } from "@/lib/strategies/definitions";

interface ScanStrategyInput {
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const strategies: ScanStrategyInput[] = body.strategies ?? [];
    const running = strategies.filter((s) => s.status === "running");

    if (running.length === 0) {
      return NextResponse.json({
        scanned: 0,
        signals: [],
        message: "No running strategies to scan",
      });
    }

    const results: Array<{
      strategyId: string;
      symbol: string;
      action: string;
      price: number;
      reason: string;
      confidence: number;
    }> = [];

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

    return NextResponse.json({
      scanned: running.length,
      signals: results,
      scannedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
