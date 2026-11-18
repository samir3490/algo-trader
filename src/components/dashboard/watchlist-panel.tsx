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
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">Watchlist</h2>
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void addSymbol();
          }}
        >
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Add symbol"
            className="w-32 rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-brand hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add
          </button>
        </form>
      </div>

      {loading ? (
        <p className="text-sm text-text-tertiary py-6">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-tertiary py-6">No symbols yet. Add NSE symbols to track.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => {
            const up = (row.changePercent ?? 0) >= 0;
            return (
              <li
                key={`${row.exchange}:${row.symbol}`}
                className="flex items-center gap-4 py-3"
              >
                <Link
                  href={`/paper-trading?symbol=${encodeURIComponent(row.symbol)}`}
                  className="w-24 shrink-0"
                >
                  <span className="block text-sm font-semibold text-text-primary truncate">
                    {row.symbol}
                  </span>
                  <span className="block text-xs text-text-tertiary">{row.exchange}</span>
                </Link>
                <span className="tabular-nums text-sm font-semibold text-text-primary">
                  {row.lastPrice != null ? (
                    formatCurrency(row.lastPrice)
                  ) : (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-text-tertiary inline" />
                  )}
                </span>
                <span
                  className={cn(
                    "tabular-nums text-sm font-medium",
                    row.changePercent == null
                      ? "text-text-tertiary"
                      : up
                        ? "text-profit"
                        : "text-loss"
                  )}
                >
                  {row.changePercent != null ? formatPercent(row.changePercent) : "—"}
                </span>
                <button
                  type="button"
                  onClick={() => void removeSymbol(row.symbol)}
                  className="ml-auto p-1.5 rounded-lg text-text-tertiary hover:text-loss hover:bg-loss-muted"
                  aria-label={`Remove ${row.symbol}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
