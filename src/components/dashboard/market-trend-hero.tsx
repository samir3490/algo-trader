"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Loader2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn, formatPercent } from "@/lib/utils";
import type { MarketRegimePayload } from "@/lib/market-data/market-regime";
import { chartTokens } from "@/lib/ui/chart-tokens";

const REFRESH_MS = 5 * 60 * 1000;

function SparkTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-bg-elevated px-3 py-2 shadow-xl">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="text-sm font-semibold text-text-primary">
        {payload[0].value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
      </p>
    </div>
  );
}

export default function MarketTrendHero({ marketOpen }: { marketOpen: boolean }) {
  const [data, setData] = useState<MarketRegimePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRegime = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/market/regime");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load market trend");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load market trend");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRegime();
  }, [fetchRegime]);

  useEffect(() => {
    if (!marketOpen) return;
    const interval = setInterval(() => void fetchRegime(), REFRESH_MS);
    return () => clearInterval(interval);
  }, [marketOpen, fetchRegime]);

  const isUp = (data?.changePercent ?? 0) >= 0;
  const regime = data?.regime;

  return (
    <div className="card h-full">
      <div className="flex flex-col gap-5">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="space-y-1">
              <h2 className="type-title text-text-primary">Market trend</h2>
              <p className="type-caption">
                {data?.indexName ?? "Nifty 50"} · regime for strategy weights
              </p>
            </div>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-text-tertiary" />}
          </div>

          {error && <p className="text-sm text-loss mb-2">{error}</p>}

          {data && (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <p className="text-2xl sm:text-3xl font-bold text-text-primary tabular-nums leading-tight break-words">
                  {data.lastPrice > 0
                    ? data.lastPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })
                    : "—"}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  {isUp ? (
                    <ArrowUpRight className="h-4 w-4 text-profit" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 text-loss" />
                  )}
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      isUp ? "text-profit" : "text-loss"
                    )}
                  >
                    {data.change >= 0 ? "+" : ""}
                    {data.change.toFixed(2)} ({formatPercent(data.changePercent)})
                  </span>
                  <span className="text-xs text-text-tertiary">today</span>
                </div>
              </div>

              {regime && (
                <div className="flex flex-wrap gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold",
                      regime.regime === "TRENDING"
                        ? "bg-profit-muted text-profit"
                        : "bg-mode-paper-soft text-mode-paper-fg"
                    )}
                  >
                    {regime.regime === "TRENDING" ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5" />
                    )}
                    {regime.regime === "TRENDING" ? "Trending" : "Mean reversion"}
                  </span>
                  <span className="inline-flex items-center rounded-md bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary">
                    ADX {regime.adx.toFixed(1)}
                    {regime.adxSlope >= 0 ? " ↑" : " ↓"}
                  </span>
                </div>
              )}
            </div>
          )}

          {regime && (
            <div className="mt-3 flex flex-wrap gap-2.5">
              <WeightBar label="Trend" pct={regime.weights.trend * 100} color="bg-profit" />
              <WeightBar label="Momentum" pct={regime.weights.momentum * 100} color="bg-mode-paper" />
              <WeightBar
                label="Reversion"
                pct={regime.weights.reversion * 100}
                color="bg-mode-live"
              />
            </div>
          )}

          {data?.priceNote && (
            <p className="text-[10px] text-text-tertiary mt-2">{data.priceNote}</p>
          )}
        </div>

        <div className="w-full h-28 sm:h-32 shrink-0">
          {data?.sparkline && data.sparkline.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.sparkline} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="niftySparkGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={isUp ? chartTokens.profit : chartTokens.loss}
                      stopOpacity={0.35}
                    />
                    <stop
                      offset="95%"
                      stopColor={isUp ? chartTokens.profit : chartTokens.loss}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide />
                <YAxis hide domain={["auto", "auto"]} />
                <Tooltip content={<SparkTooltip />} />
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke={isUp ? chartTokens.profit : chartTokens.loss}
                  strokeWidth={2}
                  fill="url(#niftySparkGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center rounded-lg bg-bg-tertiary/40 text-xs text-text-tertiary">
              {loading ? "Loading chart…" : "No index history"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WeightBar({
  label,
  pct,
  color,
}: {
  label: string;
  pct: number;
  color: string;
}) {
  return (
    <div className="min-w-[100px] flex-1 max-w-[140px]">
      <div className="flex justify-between text-[10px] text-text-tertiary mb-1">
        <span>{label}</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
