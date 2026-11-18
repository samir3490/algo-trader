"use client";

import { useEffect, useState } from "react";
import { Loader2, Radio } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import EmptyState from "@/components/ui/empty-state";

interface LiveSnap {
  available: number;
  used: number;
  dayPnl: number;
  holdingsPnl: number;
  openPositions: number;
  openOrders: number;
  accountId?: string;
}

export default function LiveAnalyticsPanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [snap, setSnap] = useState<LiveSnap | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const accountsRes = await fetch("/api/zerodha/accounts");
        const accountsJson = await accountsRes.json().catch(() => ({}));
        const account =
          (accountsJson.accounts || []).find((a: { connected?: boolean }) => a.connected !== false) ||
          (accountsJson.accounts || [])[0];
        if (!account?.kiteUserId) {
          if (!cancelled) setSnap(null);
          return;
        }
        const [marginsRes, positionsRes, holdingsRes, ordersRes] = await Promise.all([
          fetch(`/api/zerodha/margins?accountId=${account.kiteUserId}`),
          fetch(`/api/zerodha/positions?accountId=${account.kiteUserId}`),
          fetch(`/api/zerodha/holdings?accountId=${account.kiteUserId}`),
          fetch(`/api/zerodha/orders?accountId=${account.kiteUserId}`),
        ]);
        const margins = marginsRes.ok ? await marginsRes.json() : {};
        const positions = positionsRes.ok ? (await positionsRes.json()).positions || [] : [];
        const holdings = holdingsRes.ok ? (await holdingsRes.json()).holdings || [] : [];
        const orders = ordersRes.ok ? (await ordersRes.json()).orders || [] : [];
        let dayPnl = 0;
        for (const p of positions) dayPnl += Number(p.pnl || 0);
        let holdingsPnl = 0;
        for (const h of holdings) holdingsPnl += Number(h.pnl || 0);
        if (!cancelled) {
          setSnap({
            available:
              Number(margins.available?.cash ?? margins.available?.live_balance ?? 0) || 0,
            used: Number(margins.utilised?.debits ?? 0) || 0,
            dayPnl,
            holdingsPnl,
            openPositions: positions.filter((p: { qty?: number }) => Number(p.qty || 0) !== 0)
              .length,
            openOrders: orders.filter((o: { status?: string }) =>
              ["OPEN", "TRIGGER PENDING", "AMO REQ RECEIVED"].includes(
                String(o.status || "").toUpperCase()
              )
            ).length,
            accountId: account.kiteUserId,
          });
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

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary p-3 flex items-center gap-2 text-xs text-text-tertiary">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading live analytics…
      </div>
    );
  }

  if (!snap) {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary">
        <EmptyState
          compact
          icon={Radio}
          title="Live analytics unavailable"
          description="Connect a Zerodha account to mirror live cash, day P&L, and open risk."
        />
      </div>
    );
  }

  const items = [
    { label: "Cash", value: formatCurrency(snap.available) },
    { label: "Margin used", value: formatCurrency(snap.used) },
    {
      label: "Day P&L",
      value: formatCurrency(snap.dayPnl),
      tone: snap.dayPnl >= 0 ? "profit" : "loss",
    },
    {
      label: "Holdings P&L",
      value: formatCurrency(snap.holdingsPnl),
      tone: snap.holdingsPnl >= 0 ? "profit" : "loss",
    },
    { label: "Open positions", value: String(snap.openPositions) },
    { label: "Open orders", value: String(snap.openOrders) },
  ];

  return (
    <section className="rounded-lg border border-mode-live-border/60 bg-bg-secondary p-2.5 sm:p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-sm font-semibold text-text-primary">Live analytics</h2>
        <span className="text-[10px] text-mode-live font-medium">{snap.accountId}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
        {items.map((item) => (
          <div key={item.label} className="rounded-md border border-border bg-bg-primary/50 px-2 py-1.5">
            <p className="text-[10px] text-text-tertiary">{item.label}</p>
            <p
              className={cn(
                "text-sm font-bold tabular-nums leading-tight",
                item.tone === "profit" && "text-profit",
                item.tone === "loss" && "text-loss"
              )}
            >
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
