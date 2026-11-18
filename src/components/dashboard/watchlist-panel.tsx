"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Star, Trash2, TrendingDown, TrendingUp } from "lucide-react";
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
  loading?: boolean;
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
    const next = [...rows.map(({ symbol: s, exchange }) => ({ symbol: s, exchange })), { symbol: sym, exchange: "NSE" }];
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
    <section className="card">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-accent" />
            <h2 className="type-title text-text-primary">Watchlist</h2>
          </div>
          <p className="type-caption text-text-secondary mt-1">
            Quick quotes — tap a symbol to trade on paper
          </p>
        </div>
      </div>

      <form
        className="flex gap-2 mb-3"
        onSubmit={(e) => {
          e.preventDefault();
          void addSymbol();
        }}
      >
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="Add symbol e.g. SBIN"
          className="min-h-11 flex-1 rounded-lg border border-border bg-bg-primary px-3 text-sm text-text-primary outline-none focus:border-accent"
          inputMode="text"
          autoCapitalize="characters"
        />
        <Button
          type="submit"
          size="md"
          loading={saving}
          leftIcon={<Plus className="h-4 w-4" />}
          aria-label="Add to watchlist"
        >
          <span className="hidden sm:inline">Add</span>
        </Button>
      </form>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          compact
          icon={Star}
          title="No symbols yet"
          description="Add NSE symbols you want to track on the go."
        />
      ) : (
        <ul className="divide-y divide-border -mx-1">
          {rows.map((row) => {
            const up = (row.changePercent ?? 0) >= 0;
            return (
              <li key={`${row.exchange}:${row.symbol}`}>
                <div className="flex items-center gap-2 py-2.5 px-1 min-h-[52px]">
                  <Link
                    href={`/paper-trading?symbol=${encodeURIComponent(row.symbol)}`}
                    className="min-w-0 flex-1 touch-manipulation"
                  >
                    <p className="text-sm font-semibold text-text-primary">{row.symbol}</p>
                    <p className="text-[11px] text-text-tertiary">{row.exchange}</p>
                  </Link>
                  <div className="text-right shrink-0">
                    {row.lastPrice != null ? (
                      <>
                        <p className="text-sm font-semibold tabular-nums text-text-primary">
                          {formatCurrency(row.lastPrice)}
                        </p>
                        <p
                          className={cn(
                            "text-[11px] font-medium tabular-nums inline-flex items-center gap-0.5",
                            up ? "text-profit" : "text-loss"
                          )}
                        >
                          {up ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {formatPercent(row.changePercent ?? 0)}
                        </p>
                      </>
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin text-text-tertiary ml-auto" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeSymbol(row.symbol)}
                    className="p-2.5 rounded-lg text-text-tertiary hover:text-loss hover:bg-loss-muted touch-manipulation"
                    aria-label={`Remove ${row.symbol}`}
                  >
                    <Trash2 className="h-4 w-4" />
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
