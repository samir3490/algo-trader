"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { getSettings } from "@/lib/firebase";
import MetricStrip from "@/components/ui/metric-strip";

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

/** Compact live Zerodha numbers — content-width, no empty stretch. */
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
          orderNotional: settings.liveOrderNotional ?? settings.maxOrderValue ?? 5_000,
          accountId: connected?.kiteUserId,
          connected: Boolean(connected),
        };

        if (!connected) {
          if (!cancelled) setSnap(base);
          return;
        }

        const [marginsRes, positionsRes] = await Promise.all([
          fetch(`/api/zerodha/margins?accountId=${connected.kiteUserId}`),
          fetch(`/api/zerodha/positions?accountId=${connected.kiteUserId}`),
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
        const available =
          Number(margins.available?.cash ?? margins.available?.live_balance ?? 0) || 0;
        const used = Number(margins.utilised?.debits ?? margins.utilised?.span ?? 0) || 0;
        const net = Number(margins.net ?? available - used) || available;

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
    <section className="rounded-lg border border-mode-live-border bg-mode-live-muted/80 p-2.5 sm:p-3 h-full w-full">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <h2 className="text-sm font-semibold text-mode-live-fg">Live</h2>
        <span className="text-xs uppercase tracking-wide text-mode-live">Real money · Zerodha</span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-xs font-semibold uppercase",
            snap.autoOn ? "bg-loss-muted text-loss" : "bg-mode-live-soft text-mode-live-fg"
          )}
        >
          Auto {snap.autoOn ? "ON" : "OFF"}
        </span>
        <Link
          href="/live-trading"
          className="rounded-md bg-mode-live px-2 py-1 text-xs font-semibold text-white hover:bg-mode-live-hover"
        >
          Open →
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-1 text-sm text-text-tertiary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </div>
      ) : !snap.connected ? (
        <p className="text-sm text-text-secondary leading-snug max-w-md">
          Connect Zerodha in{" "}
          <Link href="/settings?tab=live" className="text-mode-live font-medium underline">
            Settings → Live
          </Link>
          . Cap ₹{snap.capitalLimit.toLocaleString("en-IN")} · order ₹
          {snap.orderNotional.toLocaleString("en-IN")}
        </p>
      ) : (
        <MetricStrip
          items={[
            { label: "Cash", value: formatCurrency(snap.available), tone: "live" },
            {
              label: "Margin",
              value: formatCurrency(snap.used),
              sub: `${snap.openQty} open`,
            },
            {
              label: "Day P&L",
              value: formatCurrency(snap.dayPnl),
              tone: snap.dayPnl >= 0 ? "profit" : "loss",
            },
          ]}
        />
      )}
    </section>
  );
}
