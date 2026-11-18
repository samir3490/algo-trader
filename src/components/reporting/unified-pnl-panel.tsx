"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  getPaperTradingState,
  getOrders,
  getSettings,
} from "@/lib/firebase";
import { normalizePaperTrades } from "@/lib/paper-trades/normalize";
import { resolvePaperStartingBalance } from "@/lib/paper-trading/balance";
import { computePnlBreakdown } from "@/lib/portfolio/compute-portfolio";
import {
  computeTradePeriodTotals,
  resolveTradeDateRange,
  type TradePeriodPreset,
} from "@/lib/portfolio/trade-period";

type Book = "paper" | "live";

const PERIODS: { key: TradePeriodPreset; label: string }[] = [
  { key: "week", label: "1W" },
  { key: "month", label: "1M" },
  { key: "year", label: "1Y" },
  { key: "all", label: "All" },
];

export default function UnifiedPnlPanel() {
  const { user } = useAuth();
  const [book, setBook] = useState<Book>("paper");
  const [period, setPeriod] = useState<TradePeriodPreset>("week");
  const [loading, setLoading] = useState(true);
  const [paper, setPaper] = useState<{
    realized: number;
    unrealized: number;
    allTime: number;
    periodPnl: number;
    periodFees: number;
    trades: number;
  } | null>(null);
  const [live, setLive] = useState<{
    dayPnl: number;
    available: number;
    openQty: number;
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [state, orders, settings, accountsRes] = await Promise.all([
          getPaperTradingState(),
          getOrders(),
          getSettings(),
          fetch("/api/zerodha/accounts"),
        ]);
        if (cancelled) return;
        const trades = normalizePaperTrades(state.trades ?? [], orders);
        const starting = resolvePaperStartingBalance(settings);
        const breakdown = computePnlBreakdown(
          trades,
          state.holdings ?? [],
          state.balance ?? starting,
          starting
        );
        const range = resolveTradeDateRange(period);
        const totals = computeTradePeriodTotals(trades, range);
        setPaper({
          realized: breakdown.realizedPnl,
          unrealized: breakdown.unrealizedPnl,
          allTime: breakdown.allTimePnl,
          periodPnl: totals.realizedPnl,
          periodFees: totals.fees,
          trades: totals.tradeCount,
        });

        const accountsJson = await accountsRes.json().catch(() => ({}));
        const account =
          (accountsJson.accounts || []).find((a: { connected?: boolean }) => a.connected !== false) ||
          (accountsJson.accounts || [])[0];
        if (account?.kiteUserId) {
          const [marginsRes, positionsRes] = await Promise.all([
            fetch(`/api/zerodha/margins?accountId=${account.kiteUserId}`),
            fetch(`/api/zerodha/positions?accountId=${account.kiteUserId}`),
          ]);
          const margins = marginsRes.ok ? await marginsRes.json() : {};
          const positionsJson = positionsRes.ok ? await positionsRes.json() : {};
          const positions = positionsJson.positions || [];
          let dayPnl = 0;
          let openQty = 0;
          for (const p of positions) {
            dayPnl += Number(p.pnl || 0);
            openQty += Math.abs(Number(p.qty || p.quantity || 0));
          }
          setLive({
            dayPnl,
            available:
              Number(margins.available?.cash ?? margins.available?.live_balance ?? 0) || 0,
            openQty,
          });
        } else {
          setLive(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user, period]);

  const rows = useMemo(() => {
    if (book === "paper" && paper) {
      return [
        { label: "Period realized", value: paper.periodPnl },
        { label: "Period fees", value: -paper.periodFees },
        { label: "All-time P&L", value: paper.allTime },
        { label: "Unrealized", value: paper.unrealized },
      ];
    }
    if (book === "live" && live) {
      return [
        { label: "Day P&L (positions)", value: live.dayPnl },
        { label: "Cash available", value: live.available },
        { label: "Open names", value: live.openQty, plain: true },
      ];
    }
    return [];
  }, [book, paper, live]);

  return (
    <section className="rounded-lg border border-border bg-bg-secondary p-2.5 sm:p-3 w-fit max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 className="text-sm font-semibold text-text-primary">Unified P&amp;L</h2>
        <div className="flex items-center gap-1">
          {(["paper", "live"] as Book[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBook(b)}
              className={cn(
                "px-2 py-1 rounded-md text-[11px] font-semibold capitalize min-h-8",
                book === b
                  ? b === "paper"
                    ? "bg-mode-paper-soft text-mode-paper-fg"
                    : "bg-mode-live-soft text-mode-live-fg"
                  : "text-text-tertiary hover:bg-bg-hover"
              )}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {book === "paper" && (
        <div className="flex gap-1 mb-2 overflow-x-auto">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={cn(
                "px-2 py-1 rounded text-[11px] font-medium min-h-7",
                period === p.key
                  ? "bg-accent text-brand"
                  : "bg-bg-tertiary text-text-secondary"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-3 text-xs text-text-tertiary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-text-tertiary py-2">
          {book === "live" ? "Connect Zerodha to see live P&L." : "No paper data yet."}
        </p>
      ) : (
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {rows.map((r) => (
            <div key={r.label} className="min-w-0 shrink-0">
              <p className="text-xs text-text-tertiary">{r.label}</p>
              <p
                className={cn(
                  "text-base font-bold tabular-nums leading-tight whitespace-nowrap",
                  "plain" in r && r.plain
                    ? "text-text-primary"
                    : r.value >= 0
                      ? "text-profit"
                      : "text-loss"
                )}
              >
                {"plain" in r && r.plain ? r.value : formatCurrency(r.value)}
              </p>
            </div>
          ))}
        </div>
      )}
      {book === "paper" && paper && (
        <p className="text-[10px] text-text-tertiary mt-1.5">
          {paper.trades} trade(s) in period · realized {formatCurrency(paper.realized)} all-time closed
        </p>
      )}
    </section>
  );
}
