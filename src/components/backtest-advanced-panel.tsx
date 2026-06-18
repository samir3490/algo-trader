"use client";

import { useState, useMemo } from "react";
import {
  AlertTriangle,
  FlaskConical,
  Grid3X3,
  Loader2,
  Play,
} from "lucide-react";
import { cn, formatPercent } from "@/lib/utils";
import { STRATEGY_DEFINITIONS } from "@/lib/strategies/definitions";
import { useTableSort } from "@/hooks/use-table-sort";
import SortableTh from "@/components/ui/sortable-th";

const INITIAL_CAPITAL = 1_000_000;

type Mode = "walk-forward" | "grid-search";

interface WalkForwardSummary {
  avgInSampleReturnPct: number;
  avgOutOfSampleReturnPct: number;
  overfitWindows: number;
  windows: {
    trainStart: string;
    trainEnd: string;
    testStart: string;
    testEnd: string;
    inSample: { totalReturnPct: number; sharpeRatio: number };
    outOfSample: { totalReturnPct: number; sharpeRatio: number };
    overfitWarning: boolean;
  }[];
}

interface GridSearchSummary {
  combinationsTested: number;
  overfitWarning: string | null;
  rows: {
    rank: number;
    params: Record<string, number>;
    result: {
      totalReturnPct: number;
      sharpeRatio: number;
      profitFactor: number;
      maxDrawdownPct: number;
    };
  }[];
}

function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

export default function BacktestAdvancedPanel() {
  const [mode, setMode] = useState<Mode>("walk-forward");
  const [symbol, setSymbol] = useState("RELIANCE");
  const [strategyId, setStrategyId] = useState("sma");
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 3 * 365 * 86400000).toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [trainMonths, setTrainMonths] = useState(12);
  const [testMonths, setTestMonths] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [wfResult, setWfResult] = useState<WalkForwardSummary | null>(null);
  const [gridResult, setGridResult] = useState<GridSearchSummary | null>(null);

  const wfSort = useTableSort({ key: "oosReturn", dir: "desc" });
  const sortedWfWindows = useMemo(() => {
    if (!wfResult) return [];
    return wfSort.sortRows(wfResult.windows, {
      train: (w) => w.trainStart,
      test: (w) => w.testStart,
      isReturn: (w) => w.inSample.totalReturnPct,
      oosReturn: (w) => w.outOfSample.totalReturnPct,
      oosSharpe: (w) => w.outOfSample.sharpeRatio,
    });
  }, [wfResult, wfSort.sortRows]);

  const gridSort = useTableSort({ key: "sharpe", dir: "desc" });
  const sortedGridRows = useMemo(() => {
    if (!gridResult) return [];
    return gridSort.sortRows(gridResult.rows, {
      rank: (r) => r.rank,
      params: (r) => Object.values(r.params).join(","),
      return: (r) => r.result.totalReturnPct,
      sharpe: (r) => r.result.sharpeRatio,
      pf: (r) => r.result.profitFactor,
      maxDd: (r) => r.result.maxDrawdownPct,
    });
  }, [gridResult, gridSort.sortRows]);

  const strategies = STRATEGY_DEFINITIONS.filter((s) =>
    ["sma", "ema", "rsi", "mean_reversion"].includes(s.id)
  );

  async function run() {
    setLoading(true);
    setError("");
    setWfResult(null);
    setGridResult(null);
    try {
      const endpoint =
        mode === "walk-forward"
          ? "/api/backtest/walk-forward"
          : "/api/backtest/grid-search";
      const body: Record<string, unknown> = {
        symbol,
        strategyId,
        startDate,
        endDate,
        initialCapital: INITIAL_CAPITAL,
        slippagePct: 0.05,
      };
      if (mode === "walk-forward") {
        body.trainMonths = trainMonths;
        body.testMonths = testMonths;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");

      if (mode === "walk-forward") {
        setWfResult(data.result);
      } else {
        setGridResult(data.result);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-accent-muted p-2">
            <FlaskConical className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Optimization
            </h2>
            <p className="text-xs text-text-secondary max-w-xl">
              Walk-forward validates out-of-sample performance. Grid search finds
              parameter sets — always confirm with walk-forward to reduce
              overfitting.
            </p>
          </div>
        </div>
        <div className="flex rounded-lg border border-border p-0.5">
          <button
            type="button"
            onClick={() => setMode("walk-forward")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "walk-forward"
                ? "bg-accent text-brand"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            Walk-forward
          </button>
          <button
            type="button"
            onClick={() => setMode("grid-search")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "grid-search"
                ? "bg-accent text-brand"
                : "text-text-secondary hover:text-text-primary"
            )}
          >
            Grid search
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            {strategies.map((s) => (
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
        {mode === "walk-forward" && (
          <>
            <div>
              <label className="text-xs text-text-tertiary">Train (months)</label>
              <input
                type="number"
                min={3}
                max={36}
                value={trainMonths}
                onChange={(e) => setTrainMonths(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-text-tertiary">Test (months)</label>
              <input
                type="number"
                min={1}
                max={12}
                value={testMonths}
                onChange={(e) => setTestMonths(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm"
              />
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => void run()}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-brand disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : mode === "walk-forward" ? (
          <Play className="h-4 w-4" />
        ) : (
          <Grid3X3 className="h-4 w-4" />
        )}
        {mode === "walk-forward" ? "Run walk-forward" : "Run grid search"}
      </button>

      {error && (
        <p className="text-sm text-loss flex items-center gap-1">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </p>
      )}

      {wfResult && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-bg-tertiary/50 p-3">
              <p className="text-[10px] text-text-tertiary">Avg in-sample</p>
              <p className="text-sm font-semibold">
                {formatPercent(wfResult.avgInSampleReturnPct)}
              </p>
            </div>
            <div className="rounded-lg bg-bg-tertiary/50 p-3">
              <p className="text-[10px] text-text-tertiary">Avg out-of-sample</p>
              <p className="text-sm font-semibold">
                {formatPercent(wfResult.avgOutOfSampleReturnPct)}
              </p>
            </div>
            <div className="rounded-lg bg-bg-tertiary/50 p-3">
              <p className="text-[10px] text-text-tertiary">Overfit windows</p>
              <p
                className={cn(
                  "text-sm font-semibold",
                  wfResult.overfitWindows > 0 ? "text-amber-400" : "text-text-primary"
                )}
              >
                {wfResult.overfitWindows} / {wfResult.windows.length}
              </p>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-tertiary border-b border-border">
                  <SortableTh sortKey="train" activeKey={wfSort.sortKey} direction={wfSort.sortDir} onSort={wfSort.toggleSort} className="px-3 py-2">Train</SortableTh>
                  <SortableTh sortKey="test" activeKey={wfSort.sortKey} direction={wfSort.sortDir} onSort={wfSort.toggleSort} className="px-3 py-2">Test</SortableTh>
                  <SortableTh sortKey="isReturn" activeKey={wfSort.sortKey} direction={wfSort.sortDir} onSort={wfSort.toggleSort} align="right" className="px-3 py-2">IS return</SortableTh>
                  <SortableTh sortKey="oosReturn" activeKey={wfSort.sortKey} direction={wfSort.sortDir} onSort={wfSort.toggleSort} align="right" className="px-3 py-2">OOS return</SortableTh>
                  <SortableTh sortKey="oosSharpe" activeKey={wfSort.sortKey} direction={wfSort.sortDir} onSort={wfSort.toggleSort} align="right" className="px-3 py-2">OOS Sharpe</SortableTh>
                </tr>
              </thead>
              <tbody>
                {sortedWfWindows.map((w, i) => (
                  <tr
                    key={i}
                    className={cn(
                      "border-b border-border/50",
                      w.overfitWarning && "bg-amber-500/5"
                    )}
                  >
                    <td className="px-3 py-2">
                      {fmtDate(w.trainStart)} → {fmtDate(w.trainEnd)}
                    </td>
                    <td className="px-3 py-2">
                      {fmtDate(w.testStart)} → {fmtDate(w.testEnd)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPercent(w.inSample.totalReturnPct)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPercent(w.outOfSample.totalReturnPct)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {w.outOfSample.sharpeRatio.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {gridResult && (
        <div className="space-y-3">
          <p className="text-xs text-text-tertiary">
            Tested {gridResult.combinationsTested} combinations · top{" "}
            {gridResult.rows.length} by Sharpe
          </p>
          {gridResult.overfitWarning && (
            <p className="text-xs text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {gridResult.overfitWarning}
            </p>
          )}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-text-tertiary border-b border-border">
                  <SortableTh sortKey="rank" activeKey={gridSort.sortKey} direction={gridSort.sortDir} onSort={gridSort.toggleSort} className="px-3 py-2">#</SortableTh>
                  <SortableTh sortKey="params" activeKey={gridSort.sortKey} direction={gridSort.sortDir} onSort={gridSort.toggleSort} className="px-3 py-2">Params</SortableTh>
                  <SortableTh sortKey="return" activeKey={gridSort.sortKey} direction={gridSort.sortDir} onSort={gridSort.toggleSort} align="right" className="px-3 py-2">Return</SortableTh>
                  <SortableTh sortKey="sharpe" activeKey={gridSort.sortKey} direction={gridSort.sortDir} onSort={gridSort.toggleSort} align="right" className="px-3 py-2">Sharpe</SortableTh>
                  <SortableTh sortKey="pf" activeKey={gridSort.sortKey} direction={gridSort.sortDir} onSort={gridSort.toggleSort} align="right" className="px-3 py-2">PF</SortableTh>
                  <SortableTh sortKey="maxDd" activeKey={gridSort.sortKey} direction={gridSort.sortDir} onSort={gridSort.toggleSort} align="right" className="px-3 py-2">Max DD</SortableTh>
                </tr>
              </thead>
              <tbody>
                {sortedGridRows.map((row) => (
                  <tr key={row.rank} className="border-b border-border/50">
                    <td className="px-3 py-2">{row.rank}</td>
                    <td className="px-3 py-2 font-mono text-[10px]">
                      {Object.entries(row.params)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(", ")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPercent(row.result.totalReturnPct)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.result.sharpeRatio.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.result.profitFactor.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPercent(-row.result.maxDrawdownPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
