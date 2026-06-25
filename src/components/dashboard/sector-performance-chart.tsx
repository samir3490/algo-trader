"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { cn, formatPercent } from "@/lib/utils";
import type {
  SectorPerformancePayload,
  SectorPerformanceRow,
} from "@/lib/market-data/sector-performance";

const REFRESH_MS = 5 * 60 * 1000;

function SectorTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: SectorPerformanceRow }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-bg-elevated px-3 py-2 shadow-xl text-xs">
      <p className="font-semibold text-text-primary">{row.name}</p>
      <p className={row.changePercent >= 0 ? "text-profit" : "text-loss"}>
        {row.changePercent >= 0 ? "+" : ""}
        {formatPercent(row.changePercent)}
      </p>
    </div>
  );
}

export default function SectorPerformanceChart({
  marketOpen,
}: {
  marketOpen: boolean;
}) {
  const [data, setData] = useState<SectorPerformancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchSectors = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/market/sectors?timeframe=1d");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load sectors");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sectors");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSectors();
  }, [fetchSectors]);

  useEffect(() => {
    if (!marketOpen) return;
    const interval = setInterval(() => void fetchSectors(), REFRESH_MS);
    return () => clearInterval(interval);
  }, [marketOpen, fetchSectors]);

  const chartData = useMemo(() => data?.sectors ?? [], [data]);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Sector Performance</h2>
          <p className="text-sm text-text-secondary">
            Nifty sectoral indices · best to worst (today)
          </p>
        </div>
        {loading && <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />}
      </div>

      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

      {chartData.length > 0 ? (
        <>
          <div className="h-[280px] sm:h-[360px] mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
              >
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                  tick={{ fill: "#595959", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={96}
                  tick={{ fill: "#595959", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<SectorTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="changePercent" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {chartData.map((entry) => (
                    <Cell
                      key={entry.id}
                      fill={entry.changePercent >= 0 ? "#10b981" : "#ef4444"}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="border-t border-border pt-3">
            <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-2">
              Sector drivers (Top 100 universe)
            </p>
            <div className="space-y-1">
              {chartData.map((row) => {
                const open = expandedId === row.id;
                const hasDrivers = row.drivers.length > 0 || row.draggers.length > 0;
                return (
                  <div key={row.id} className="rounded-lg border border-border/60 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedId(open ? null : row.id)}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-bg-hover/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {hasDrivers ? (
                          open ? (
                            <ChevronDown className="h-4 w-4 text-text-tertiary shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-text-tertiary shrink-0" />
                          )
                        ) : (
                          <span className="w-4" />
                        )}
                        <span className="text-sm font-medium text-text-primary truncate">
                          {row.name}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "text-sm font-semibold tabular-nums shrink-0 ml-2",
                          row.changePercent >= 0 ? "text-profit" : "text-loss"
                        )}
                      >
                        {row.changePercent >= 0 ? "+" : ""}
                        {formatPercent(row.changePercent)}
                      </span>
                    </button>

                    {open && hasDrivers && (
                      <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-bg-tertiary/20">
                        <DriverList title="Top drivers" stocks={row.drivers} positive />
                        <DriverList title="Top draggers" stocks={row.draggers} positive={false} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : !loading ? (
        <div className="py-12 text-center text-sm text-text-secondary">
          No sector data available
        </div>
      ) : null}

      {data?.priceNote && (
        <p className="text-[10px] text-text-tertiary mt-3">{data.priceNote}</p>
      )}
    </div>
  );
}

function DriverList({
  title,
  stocks,
  positive,
}: {
  title: string;
  stocks: SectorPerformanceRow["drivers"];
  positive: boolean;
}) {
  if (stocks.length === 0) {
    return (
      <div>
        <p className="text-[10px] uppercase tracking-wider text-text-tertiary mb-1.5">{title}</p>
        <p className="text-xs text-text-tertiary">None</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-text-tertiary mb-1.5">{title}</p>
      <ul className="space-y-1">
        {stocks.map((s) => (
          <li
            key={s.symbol}
            className="flex items-center justify-between text-xs rounded-md bg-bg-tertiary/50 px-2 py-1.5"
          >
            <span className="font-medium text-text-primary">{s.symbol}</span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                positive ? "text-profit" : "text-loss"
              )}
            >
              {s.changePercent >= 0 ? "+" : ""}
              {formatPercent(s.changePercent)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
