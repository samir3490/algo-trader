"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Star, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  getWatchlist,
  saveWatchlist,
  type WatchlistItem,
} from "@/lib/firebase";
import { fetchMarketQuote } from "@/lib/market-data/fetch-quote-client";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import { useOptionalToast } from "@/components/ui/toast";
import Button from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

interface QuoteRow extends WatchlistItem {
  lastPrice?: number;
  changePercent?: number;
}

export default function WatchlistPanel() {
  const { user } = useAuth();
  const toast = useOptionalToast();
  const [rows, setRows] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [symbol, setSymbol] = useState("");
  const [saving, setSaving] = useState(false);

  const refreshQuotes = useCallback(async (items: WatchlistItem[]) => {
    const withQuotes = await Promise.all(
      items.map(async (item) => {
        try {
          const q = await fetchMarketQuote(item.symbol, item.exchange);
          return {
            ...item,
            lastPrice: q?.lastPrice,
            changePercent: q?.changePercent,
          } satisfies QuoteRow;
        } catch {
          return { ...item } satisfies QuoteRow;
        }
      })
    );
    setRows(withQuotes);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const items = await getWatchlist();
        if (cancelled) return;
        setRows(items);
        await refreshQuotes(items);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user, refreshQuotes]);

  async function persist(next: WatchlistItem[]) {
    setSaving(true);
    try {
      await saveWatchlist(next);
      setRows((prev) => {
        const quoteMap = new Map(prev.map((r) => [`${r.exchange}:${r.symbol}`, r]));
        return next.map((item) => ({
          ...item,
          ...quoteMap.get(`${item.exchange}:${item.symbol}`),
          symbol: item.symbol,
          exchange: item.exchange,
        }));
      });
      void refreshQuotes(next);
    } catch {
      toast.error("Could not save watchlist");
    } finally {
      setSaving(false);
    }
  }

  async function addSymbol() {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    if (rows.some((r) => r.symbol === sym)) {
      toast.info(`${sym} is already on your watchlist`);
      return;
    }
    const next = [
      ...rows.map(({ symbol: s, exchange }) => ({ symbol: s, exchange })),
      { symbol: sym, exchange: "NSE" },
    ];
    setSymbol("");
    await persist(next);
    toast.success(`Added ${sym}`);
  }

  async function removeSymbol(sym: string) {
    const next = rows
      .filter((r) => r.symbol !== sym)
      .map(({ symbol: s, exchange }) => ({ symbol: s, exchange }));
    await persist(next);
    toast.info(`Removed ${sym}`);
  }

  return (
    <section className="rounded-lg border border-border bg-bg-secondary p-2.5 sm:p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Star className="h-3.5 w-3.5 text-accent shrink-0" />
          <h2 className="text-sm font-semibold text-text-primary">Watchlist</h2>
        </div>
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void addSymbol();
          }}
        >
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Add"
            className="w-24 sm:w-28 h-8 rounded-md border border-border bg-bg-primary px-2 text-xs text-text-primary outline-none focus:border-accent"
            inputMode="text"
            autoCapitalize="characters"
          />
          <Button
            type="submit"
            size="sm"
            loading={saving}
            leftIcon={<Plus className="h-3.5 w-3.5" />}
            className="!min-h-8 !px-2"
            aria-label="Add to watchlist"
          >
            <span className="sr-only sm:not-sr-only sm:inline">Add</span>
          </Button>
        </form>
      </div>

      {loading ? (
        <div className="space-y-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-md" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          compact
          icon={Star}
          title="No symbols yet"
          description="Add NSE symbols to track."
        />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => {
            const up = (row.changePercent ?? 0) >= 0;
            return (
              <li key={`${row.exchange}:${row.symbol}`}>
                <div className="flex items-center gap-2.5 py-1.5 min-h-8">
                  <Link
                    href={`/paper-trading?symbol=${encodeURIComponent(row.symbol)}`}
                    className="w-[5.25rem] shrink-0 touch-manipulation"
                  >
                    <span className="block text-xs font-semibold text-text-primary truncate leading-tight">
                      {row.symbol}
                    </span>
                    <span className="block text-[10px] text-text-tertiary leading-none">
                      {row.exchange}
                    </span>
                  </Link>
                  <span className="w-[5.75rem] shrink-0 text-right tabular-nums text-xs font-semibold text-text-primary">
                    {row.lastPrice != null ? (
                      formatCurrency(row.lastPrice)
                    ) : (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-text-tertiary inline" />
                    )}
                  </span>
                  <span
                    className={cn(
                      "w-12 shrink-0 text-right tabular-nums text-[11px] font-medium",
                      row.changePercent == null
                        ? "text-text-tertiary"
                        : up
                          ? "text-profit"
                          : "text-loss"
                    )}
                  >
                    {row.changePercent != null
                      ? formatPercent(row.changePercent)
                      : "—"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void removeSymbol(row.symbol)}
                    className="ml-auto p-1 rounded-md text-text-tertiary hover:text-loss hover:bg-loss-muted touch-manipulation"
                    aria-label={`Remove ${row.symbol}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
