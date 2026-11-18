"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { getOrders, getPaperTradingState, getSettings } from "@/lib/firebase";
import { normalizePaperTrades } from "@/lib/paper-trades/normalize";
import { resolvePaperStartingBalance } from "@/lib/paper-trading/balance";
import { computePaperPortfolioAnalytics } from "@/lib/analytics/paper-analytics";

export default function AttributionWidgets() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [byStrategy, setByStrategy] = useState<
    { label: string; pnl: number; trips: number }[]
  >([]);
  const [sectors, setSectors] = useState<
    { name: string; changePercent: number }[]
  >([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [state, orders, settings, sectorRes] = await Promise.all([
          getPaperTradingState(),
          getOrders(),
          getSettings(),
          fetch("/api/market/sectors?timeframe=1d"),
        ]);
        if (cancelled) return;
        const trades = normalizePaperTrades(state.trades ?? [], orders);
        const starting = resolvePaperStartingBalance(settings);
        const analytics = computePaperPortfolioAnalytics(
          trades,
          state.holdings ?? [],
          state.balance ?? starting,
          starting
        );
        setByStrategy(
          analytics.byStrategy
            .map((g) => ({
              label: g.label,
              pnl: g.metrics.netPnl,
              trips: g.roundTrips,
            }))
            .sort((a, b) => b.pnl - a.pnl)
            .slice(0, 5)
        );
        if (sectorRes.ok) {
          const json = await sectorRes.json();
          const list = (json.sectors || [])
            .map((s: { name: string; changePercent: number }) => ({
              name: s.name,
              changePercent: s.changePercent,
            }))
            .sort(
              (a: { changePercent: number }, b: { changePercent: number }) =>
                Math.abs(b.changePercent) - Math.abs(a.changePercent)
            )
            .slice(0, 5);
          setSectors(list);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const maxAbsStrategy = useMemo(
    () => Math.max(1, ...byStrategy.map((s) => Math.abs(s.pnl))),
    [byStrategy]
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <section className="rounded-lg border border-border bg-bg-secondary p-2.5">
        <h3 className="text-xs font-semibold text-text-primary mb-1.5">
          Strategy attribution
        </h3>
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-text-tertiary" />
        ) : byStrategy.length === 0 ? (
          <p className="text-[11px] text-text-tertiary">No closed strategy P&amp;L yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {byStrategy.map((s) => (
              <li key={s.label}>
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate font-medium text-text-primary">{s.label}</span>
                  <span
                    className={cn(
                      "tabular-nums font-semibold shrink-0",
                      s.pnl >= 0 ? "text-profit" : "text-loss"
                    )}
                  >
                    {formatCurrency(s.pnl)}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-bg-tertiary mt-0.5 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      s.pnl >= 0 ? "bg-profit" : "bg-loss"
                    )}
                    style={{
                      width: `${Math.min(100, (Math.abs(s.pnl) / maxAbsStrategy) * 100)}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border bg-bg-secondary p-2.5">
        <h3 className="text-xs font-semibold text-text-primary mb-1.5">
          Sector movers (1D)
        </h3>
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-text-tertiary" />
        ) : sectors.length === 0 ? (
          <p className="text-[11px] text-text-tertiary">Sector data unavailable.</p>
        ) : (
          <ul className="space-y-1">
            {sectors.map((s) => (
              <li
                key={s.name}
                className="flex items-center justify-between gap-2 text-[11px] py-0.5"
              >
                <span className="truncate text-text-primary">{s.name}</span>
                <span
                  className={cn(
                    "tabular-nums font-semibold shrink-0",
                    s.changePercent >= 0 ? "text-profit" : "text-loss"
                  )}
                >
                  {formatPercent(s.changePercent)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
