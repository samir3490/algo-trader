"use client";

import { useState } from "react";
import { BarChart3, HelpCircle, Loader2, Play } from "lucide-react";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import { STRATEGY_DEFINITIONS } from "@/lib/strategies/definitions";

const INITIAL_CAPITAL = 1_000_000;

interface BacktestResult {
  initialCapital: number;
  finalCapital: number;
  netPnL: number;
  totalReturnPct: number;
  winRate: number;
  profitFactor: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  totalTrades: number;
  closedRoundTrips: number;
  grossProfit: number;
  grossLoss: number;
  typicalQty: number;
}

function formatProfitFactor(pf: number): string {
  if (!Number.isFinite(pf) || pf >= 99) return "No losing trades";
  return pf.toFixed(2);
}

function formatReturnPct(pct: number): string {
  if (pct === 0) return "0.00%";
  if (Math.abs(pct) < 0.01) {
    const sign = pct >= 0 ? "+" : "";
    return `${sign}${pct.toFixed(4)}%`;
  }
  return formatPercent(pct);
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
          initialCapital: INITIAL_CAPITAL,
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

  const initial = result?.initialCapital ?? INITIAL_CAPITAL;

  return (
    <section className="card">
      <div className="flex items-center gap-3 mb-4">
        <div className="rounded-lg bg-accent-muted p-2">
          <BarChart3 className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Backtest</h2>
          <p className="text-xs text-text-secondary">
            Simulates trades on historical Yahoo candles (no Postgres required).
            Uses ~10% of capital per trade. Starting capital:{" "}
            {formatCurrency(INITIAL_CAPITAL)}.
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
        className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-brand disabled:opacity-60 hover:bg-accent-hover"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        Run Backtest
      </button>

      {error && <p className="mt-3 text-sm text-loss">{error}</p>}

      {result && (
        <div className="mt-5 space-y-4">
          <div className="rounded-lg border border-accent/30 bg-accent-muted/50 px-4 py-3">
            <p className="text-xs text-text-secondary mb-1">Portfolio summary</p>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <span className="text-sm text-text-secondary">
                Started with{" "}
                <strong className="text-text-primary">
                  {formatCurrency(initial)}
                </strong>
              </span>
              <span className="text-sm text-text-secondary">
                Ended with{" "}
                <strong
                  className={cn(
                    result.netPnL >= 0 ? "text-profit" : "text-loss"
                  )}
                >
                  {formatCurrency(result.finalCapital)}
                </strong>
              </span>
              <span
                className={cn(
                  "text-sm font-semibold",
                  result.netPnL >= 0 ? "text-profit" : "text-loss"
                )}
              >
                Net P&amp;L: {result.netPnL >= 0 ? "+" : ""}
                {formatCurrency(result.netPnL)} ({formatReturnPct(result.totalReturnPct)})
              </span>
            </div>
            {result.closedRoundTrips > 0 && (
              <p className="text-[11px] text-text-secondary mt-2">
                ~{result.typicalQty} shares per entry · Gross profit{" "}
                <strong className="text-profit">{formatCurrency(result.grossProfit)}</strong>
                {" · "}Gross loss{" "}
                <strong className="text-loss">{formatCurrency(result.grossLoss)}</strong>
              </p>
            )}
            <p className="text-[11px] text-text-tertiary mt-1">
              Final capital is cash left after all simulated buys and sells
              (brokerage, STT, slippage included). It is not a separate subtraction
              from ₹10L — it is what you would hold at the end of the test period.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Metric
              label="Total return"
              value={formatReturnPct(result.totalReturnPct)}
              positive={result.totalReturnPct >= 0}
              hint="(Final − Starting) ÷ Starting. Matches net P&L above."
            />
            <Metric
              label="Win rate"
              value={`${result.winRate.toFixed(1)}%`}
              hint={`Share of ${result.closedRoundTrips} completed round-trip(s) that made money after charges.`}
            />
            <Metric
              label="Gross profit"
              value={formatCurrency(result.grossProfit)}
              positive={result.grossProfit > 0}
              hint="Sum of P&L on winning round trips (after charges)."
            />
            <Metric
              label="Gross loss"
              value={formatCurrency(result.grossLoss)}
              positive={false}
              hint="Sum of losses on losing round trips (absolute value)."
            />
            <Metric
              label="Profit factor"
              value={formatProfitFactor(result.profitFactor)}
              hint="Gross profit ÷ gross loss. Above 1 means winners outweighed losers."
            />
            <Metric
              label="Max drawdown"
              value={formatPercent(-result.maxDrawdownPct)}
              positive={false}
              hint="Largest peak-to-trough drop in portfolio value during the test."
            />
            <Metric
              label="Sharpe ratio"
              value={result.sharpeRatio.toFixed(2)}
              hint="Risk-adjusted return (higher is better). Approximate; uses per-bar equity changes."
            />
            <Metric
              label="Round trips"
              value={String(result.closedRoundTrips)}
              hint={`${result.totalTrades} total fills (buy + sell).`}
            />
          </div>

          <p className="text-xs text-text-tertiary">
            Past performance is not indicative of future results. Optional{" "}
            <code className="text-text-secondary">DATABASE_URL</code> on Vercel
            only caches candles — backtest works without Postgres.
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
  hint,
}: {
  label: string;
  value: string;
  positive?: boolean;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-primary/50 px-3 py-2">
      <div className="flex items-center gap-1">
        <p className="text-xs text-text-tertiary">{label}</p>
        {hint && (
          <span className="group relative">
            <HelpCircle className="h-3 w-3 text-text-tertiary cursor-help" />
            <span
              className="pointer-events-none absolute left-0 bottom-full z-10 mb-1 hidden w-56 rounded-lg border border-border bg-bg-elevated p-2 text-[10px] leading-snug text-text-secondary shadow-lg group-hover:block"
              role="tooltip"
            >
              {hint}
            </span>
          </span>
        )}
      </div>
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
