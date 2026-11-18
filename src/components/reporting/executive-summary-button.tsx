"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import Button from "@/components/ui/button";
import { useOptionalToast } from "@/components/ui/toast";
import {
  getOrders,
  getPaperTradingState,
  getSettings,
} from "@/lib/firebase";
import { normalizePaperTrades } from "@/lib/paper-trades/normalize";
import { resolvePaperStartingBalance } from "@/lib/paper-trading/balance";
import { computePnlBreakdown } from "@/lib/portfolio/compute-portfolio";
import { computePaperPortfolioAnalytics } from "@/lib/analytics/paper-analytics";
import { downloadExecutiveSummaryHtml } from "@/lib/export/executive-summary";
import { nowISTDateTimeString } from "@/lib/utils";

export default function ExecutiveSummaryButton({
  className,
}: {
  className?: string;
}) {
  const toast = useOptionalToast();
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const [state, orders, settings, accountsRes] = await Promise.all([
        getPaperTradingState(),
        getOrders(),
        getSettings(),
        fetch("/api/zerodha/accounts"),
      ]);
      const trades = normalizePaperTrades(state.trades ?? [], orders);
      const starting = resolvePaperStartingBalance(settings);
      const balance = state.balance ?? starting;
      const holdings = state.holdings ?? [];
      const breakdown = computePnlBreakdown(
        trades,
        holdings,
        balance,
        starting
      );
      const analytics = computePaperPortfolioAnalytics(
        trades,
        holdings,
        balance,
        starting
      );

      let live:
        | {
            available: number;
            dayPnl: number;
            openPositions: number;
            connected: boolean;
            autoOn: boolean;
          }
        | null = null;
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
        const positions = positionsRes.ok
          ? (await positionsRes.json()).positions || []
          : [];
        let dayPnl = 0;
        for (const p of positions) dayPnl += Number(p.pnl || 0);
        live = {
          available:
            Number(margins.available?.cash ?? margins.available?.live_balance ?? 0) || 0,
          dayPnl,
          openPositions: positions.filter((p: { qty?: number }) => Number(p.qty || 0) !== 0)
            .length,
          connected: marginsRes.ok,
          autoOn: settings.liveAutoTradingEnabled === true,
        };
      }

      downloadExecutiveSummaryHtml({
        generatedAt: nowISTDateTimeString(),
        paper: {
          startingBalance: starting,
          balance,
          realizedPnl: breakdown.realizedPnl,
          unrealizedPnl: breakdown.unrealizedPnl,
          allTimePnl: breakdown.allTimePnl,
          metrics: analytics.overall,
          openHoldings: holdings.length,
          tradeCount: trades.length,
        },
        live,
        topStrategies: analytics.byStrategy
          .map((g) => ({
            name: g.label,
            pnl: g.metrics.netPnl,
            trips: g.roundTrips,
          }))
          .sort((a, b) => b.pnl - a.pnl)
          .slice(0, 5),
      });
      toast.success("Executive summary downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      loading={loading}
      leftIcon={<FileText className="h-3.5 w-3.5" />}
      onClick={() => void run()}
      className={className}
    >
      Exec summary
    </Button>
  );
}
