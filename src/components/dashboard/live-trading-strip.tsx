"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IndianRupee, Wallet, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { getSettings } from "@/lib/firebase";

interface LiveSnapshot {
  available: number;
  used: number;
  net: number;
  dayPnl: number;
  openQty: number;
  connected: boolean;
  autoOn: boolean;
  capitalLimit: number;
  orderNotional: number;
  accountId?: string;
}

const EMPTY: LiveSnapshot = {
  available: 0,
  used: 0,
  net: 0,
  dayPnl: 0,
  openQty: 0,
  connected: false,
  autoOn: false,
  capitalLimit: 50_000,
  orderNotional: 5_000,
};

/** Compact live Zerodha numbers — separate from paper KPIs on the dashboard. */
export default function LiveTradingDashboardStrip() {
  const { user } = useAuth();
  const [snap, setSnap] = useState<LiveSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [settings, accountsRes] = await Promise.all([
          getSettings(),
          fetch("/api/zerodha/accounts"),
        ]);
        const accountsJson = await accountsRes.json().catch(() => ({}));
        const accounts: { kiteUserId: string; connected?: boolean }[] =
          accountsJson.accounts || [];
        const connected = accounts.find((a) => a.connected !== false) || accounts[0];

        const base: LiveSnapshot = {
          ...EMPTY,
          autoOn: settings.liveAutoTradingEnabled === true,
          capitalLimit: settings.liveCapitalLimit ?? 50_000,
          orderNotional: settings.liveOrderNotional ?? 5_000,
          accountId: connected?.kiteUserId,
          connected: Boolean(connected?.kiteUserId),
        };

        if (!connected?.kiteUserId) {
          if (!cancelled) setSnap(base);
          return;
        }

        const id = connected.kiteUserId;
        const [marginsRes, positionsRes] = await Promise.all([
          fetch(`/api/zerodha/margins?accountId=${id}`),
          fetch(`/api/zerodha/positions?accountId=${id}`),
        ]);
        const margins = await marginsRes.json().catch(() => ({}));
        const positionsJson = await positionsRes.json().catch(() => ({}));

        const available = Number(margins.available ?? 0);
        const used = Number(margins.used ?? 0);
        const net = Number(margins.net ?? available);

        const kitePositions = positionsJson.positions || positionsJson;
        const netList: {
          quantity?: number;
          qty?: number;
          pnl?: number;
          m2m?: number;
        }[] = kitePositions.net || kitePositions.day || [];
        let dayPnl = 0;
        let openQty = 0;
        for (const p of netList) {
          const q = Number(p.quantity ?? p.qty ?? 0);
          if (q !== 0) openQty += 1;
          dayPnl += Number(p.pnl ?? p.m2m ?? 0);
        }

        if (!cancelled) {
          setSnap({
            ...base,
            available,
            used,
            net,
            dayPnl,
            openQty,
            connected: marginsRes.ok,
          });
        }
      } catch {
        if (!cancelled) setSnap(EMPTY);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <section className="rounded-xl border-2 border-mode-live-border bg-mode-live-muted/80 p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="type-label text-mode-live">
            Real money
          </p>
          <div className="flex items-center gap-2">
            <h2 className="type-title text-mode-live-fg">Live trading</h2>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                snap.autoOn
                  ? "bg-red-100 text-red-800"
                  : "bg-mode-live-soft text-mode-live-fg"
              )}
            >
              Auto {snap.autoOn ? "ON" : "OFF"}
            </span>
          </div>
        </div>
        <Link
          href="/live-trading"
          className="rounded-md bg-mode-live px-2.5 py-1 text-xs font-semibold text-white hover:bg-mode-live-hover"
        >
          Open live →
        </Link>
      </div>

      {loading ? (
        <div className="rounded-lg border border-mode-live-border bg-white/70 flex items-center gap-2 py-6 px-4 text-sm text-text-tertiary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Zerodha balances…
        </div>
      ) : !snap.connected ? (
        <div className="rounded-lg border border-mode-live-border bg-white/70 px-4 py-4">
          <p className="text-sm text-text-secondary">
            Connect a Zerodha account in{" "}
            <Link href="/settings?tab=live" className="text-mode-live font-medium hover:underline">
              Settings → Live
            </Link>{" "}
            to see live cash, margins, and day P&amp;L here.
          </p>
          <p className="text-xs text-text-tertiary mt-1">
            Algo caps: ₹{snap.orderNotional.toLocaleString("en-IN")} / trade · ₹
            {snap.capitalLimit.toLocaleString("en-IN")} total
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-mode-live-border bg-white/80 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-text-secondary">Cash available</span>
              <div className="rounded-lg bg-mode-live-soft p-1.5">
                <IndianRupee className="h-4 w-4 text-mode-live" />
              </div>
            </div>
            <p className="text-xl font-bold text-mode-live-fg tabular-nums break-words">
              {formatCurrency(snap.available)}
            </p>
            <p className="text-xs text-text-tertiary mt-1">
              Zerodha{snap.accountId ? ` · ${snap.accountId}` : ""}
            </p>
          </div>

          <div className="rounded-lg border border-mode-live-border bg-white/80 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-text-secondary">Margin used</span>
              <div className="rounded-lg bg-mode-live-soft p-1.5">
                <Wallet className="h-4 w-4 text-mode-live" />
              </div>
            </div>
            <p className="text-xl font-bold text-text-primary tabular-nums break-words">
              {formatCurrency(snap.used)}
            </p>
            <p className="text-xs text-text-tertiary mt-1">
              Net {formatCurrency(snap.net)} · {snap.openQty} open name
              {snap.openQty === 1 ? "" : "s"}
            </p>
          </div>

          <div className="rounded-lg border border-mode-live-border bg-white/80 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-text-secondary">Day P&amp;L</span>
              <div className="rounded-lg bg-mode-live-soft p-1.5">
                {snap.dayPnl >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-profit" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-loss" />
                )}
              </div>
            </div>
            <p
              className={cn(
                "text-xl font-bold tabular-nums break-words",
                snap.dayPnl >= 0 ? "text-profit" : "text-loss"
              )}
            >
              {formatCurrency(snap.dayPnl)}
            </p>
            <p className="text-xs text-text-tertiary mt-1">
              Cap ₹{snap.capitalLimit.toLocaleString("en-IN")} · order ₹
              {snap.orderNotional.toLocaleString("en-IN")}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
