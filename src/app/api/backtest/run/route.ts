import { NextRequest, NextResponse } from "next/server";
import { marketDataService } from "@/lib/services/market-data-service";
import { runBacktest } from "@/lib/backtest/engine";
import { writeSystemLog } from "@/lib/core/system-log";
import { getPrisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const symbol = String(body.symbol ?? "").trim().toUpperCase();
    const strategyId = String(body.strategyId ?? "sma");
    const exchange = String(body.exchange ?? "NSE");
    const initialCapital = Number(body.initialCapital ?? 1_000_000);
    const startDate = body.startDate
      ? new Date(body.startDate)
      : new Date(Date.now() - 365 * 86400000);
    const endDate = body.endDate ? new Date(body.endDate) : new Date();

    if (!symbol) {
      return NextResponse.json({ error: "symbol required" }, { status: 400 });
    }

    const candles = await marketDataService.getHistoricalCandles({
      symbol,
      exchange,
      timeframe: "Day",
      startDate,
      endDate,
    });

    if (candles.length < 40) {
      return NextResponse.json(
        { error: "Insufficient historical data for backtest" },
        { status: 400 }
      );
    }

    const result = runBacktest(candles, {
      strategyId,
      symbol,
      exchange,
      startDate,
      endDate,
      initialCapital,
      strategyParams: body.strategyParams ?? {},
      slippagePct: Number(body.slippagePct ?? 0.05),
      product: body.product === "MIS" ? "MIS" : "CNC",
    });

    const prisma = getPrisma();
    if (prisma) {
      try {
        await prisma.backtestRun.create({
          data: {
            strategyId,
            symbol,
            exchange,
            startDate,
            endDate,
            initialCapital,
            finalCapital: result.finalCapital,
            totalReturnPct: result.totalReturnPct,
            winRate: result.winRate,
            profitFactor: result.profitFactor,
            maxDrawdownPct: result.maxDrawdownPct,
            sharpeRatio: result.sharpeRatio,
            reportJson: result as object,
          },
        });
      } catch (e) {
        writeSystemLog("WARN", "BacktestAPI", "Could not persist backtest run", {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    writeSystemLog("INFO", "BacktestAPI", `Backtest complete ${symbol}`, {
      returnPct: result.totalReturnPct,
    });

    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Backtest failed";
    writeSystemLog("ERROR", "BacktestAPI", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
