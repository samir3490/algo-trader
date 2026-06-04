"use client";

import { useState } from "react";
import { BarChart3, Loader2, Play } from "lucide-react";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import { STRATEGY_DEFINITIONS } from "@/lib/strategies/definitions";

interface BacktestResult {
  totalReturnPct: number;
  winRate: number;
  profitFactor: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  finalCapital: number;
  totalTrades: number;
}

export default function BacktestPanel() {
  const [symbol, setSymbol] = useState("RELIANCE");
  const [strategyId, setStrategyId] = useState("sma");
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BacktestResult | null>(null);

  async function runBacktest() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/backtest/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          strategyId,
          startDate,
          endDate,
          initialCapital: 1_000_000,
          slippagePct: 0.05,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Backtest failed");
      setResult(data.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backtest failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card">
      <div className="flex items-center gap-3 mb-4">
        <div className="rounded-lg bg-accent-muted p-2">
          <BarChart3 className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Backtest</h2>
          <p className="text-xs text-text-secondary">
            Candle-by-candle simulation with Zerodha-style charges + slippage
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        <div>
          <label className="text-xs text-text-tertiary">Symbol</label>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="mt-1 w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-text-tertiary">Strategy</label>
          <select
            value={strategyId}
            onChange={(e) => setStrategyId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm"
          >
            {STRATEGY_DEFINITIONS.filter((s) =>
              ["sma", "ema", "rsi", "mean_reversion"].includes(s.id)
            ).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-text-tertiary">Start</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-text-tertiary">End</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => void runBacktest()}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        Run Backtest
      </button>

      {error && (
        <p className="mt-3 text-sm text-loss">{error}</p>
      )}

      {result && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Metric
            label="Total return"
            value={formatPercent(result.totalReturnPct)}
            positive={result.totalReturnPct >= 0}
          />
          <Metric label="Win rate" value={`${result.winRate.toFixed(1)}%`} />
          <Metric label="Profit factor" value={result.profitFactor.toFixed(2)} />
          <Metric
            label="Max drawdown"
            value={formatPercent(-result.maxDrawdownPct)}
            positive={false}
          />
          <Metric label="Sharpe" value={result.sharpeRatio.toFixed(2)} />
          <Metric
            label="Final capital"
            value={formatCurrency(result.finalCapital)}
          />
          <p className="sm:col-span-2 lg:col-span-3 text-xs text-text-tertiary">
            {result.totalTrades} simulated fills (charges included). Past
            performance is not indicative of future results.
          </p>
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-primary/50 px-3 py-2">
      <p className="text-xs text-text-tertiary">{label}</p>
      <p
        className={cn(
          "text-lg font-semibold",
          positive === true && "text-profit",
          positive === false && "text-loss",
          positive === undefined && "text-text-primary"
        )}
      >
        {value}
      </p>
    </div>
  );
}
