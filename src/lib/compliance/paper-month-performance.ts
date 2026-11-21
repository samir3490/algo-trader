import type { PaperTrade } from "@/lib/firebase";
import type { PortfolioHolding } from "@/lib/portfolio/compute-portfolio";
import { computePnlBreakdown } from "@/lib/portfolio/compute-portfolio";
import { extractRoundTrips } from "@/lib/analytics/paper-analytics";
import { tradeExecutedAtMs } from "@/lib/paper-trades/normalize";

const IST = "Asia/Kolkata";

function dateKeyIST(ms: number): string {
  if (!(ms > 0)) return "";
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: IST });
}

export interface PaperMonthPerformance {
  period: { from: string; to: string; days: number };
  startingBalance: number;
  cash: number;
  invested: number;
  holdingsMtm: number;
  openPositions: number;
  month: {
    fills: number;
    buys: number;
    sells: number;
    closedRoundTrips: number;
    realizedPnl: number;
    wins: number;
    losses: number;
    winRatePct: number;
  };
  allTime: {
    realizedPnl: number;
    unrealizedPnl: number;
    allTimePnlInclOpen: number;
    returnPctOnStart: number;
  };
  byStrategy: {
    strategy: string;
    sells: number;
    realizedPnl: number;
    wins: number;
    losses: number;
  }[];
}

export function buildPaperMonthPerformance(
  trades: PaperTrade[],
  holdings: PortfolioHolding[],
  balance: number,
  startingBalance: number,
  days = 30,
  now = new Date()
): PaperMonthPerformance {
  const toKey = now.toLocaleDateString("en-CA", { timeZone: IST });
  const fromMs = now.getTime() - days * 86_400_000;
  const fromKey = new Date(fromMs).toLocaleDateString("en-CA", {
    timeZone: IST,
  });

  const inWindow = trades.filter((t) => {
    const ms = tradeExecutedAtMs(t);
    const key =
      ms > 0
        ? dateKeyIST(ms)
        : t.date
          ? String(t.date).slice(0, 10)
          : "";
    return key >= fromKey && key <= toKey;
  });
  const buys = inWindow.filter((t) => t.side === "BUY");
  const sells = inWindow.filter((t) => t.side === "SELL");

  const trips = extractRoundTrips(trades).filter(
    (rt) => rt.closedAtMs >= fromMs && dateKeyIST(rt.closedAtMs) <= toKey
  );
  const realized = Math.round(trips.reduce((s, t) => s + t.pnl, 0) * 100) / 100;
  const wins = trips.filter((t) => t.pnl > 0).length;
  const losses = trips.filter((t) => t.pnl < 0).length;

  const byStrat = new Map<
    string,
    { sells: number; realizedPnl: number; wins: number; losses: number }
  >();
  for (const rt of trips) {
    const name = (rt.strategyName || "Unknown").trim() || "Unknown";
    const row = byStrat.get(name) ?? {
      sells: 0,
      realizedPnl: 0,
      wins: 0,
      losses: 0,
    };
    row.sells += 1;
    row.realizedPnl += rt.pnl;
    if (rt.pnl > 0) row.wins += 1;
    else if (rt.pnl < 0) row.losses += 1;
    byStrat.set(name, row);
  }

  const breakdown = computePnlBreakdown(
    trades,
    holdings,
    balance,
    startingBalance
  );
  const allTimeTrips = extractRoundTrips(trades);
  const allTimeRealized =
    Math.round(allTimeTrips.reduce((s, t) => s + t.pnl, 0) * 100) / 100;

  return {
    period: { from: fromKey, to: toKey, days },
    startingBalance,
    cash: Math.round(balance * 100) / 100,
    invested: Math.round(breakdown.portfolio.invested * 100) / 100,
    holdingsMtm: Math.round(breakdown.portfolio.currentValue * 100) / 100,
    openPositions: holdings.length,
    month: {
      fills: inWindow.length,
      buys: buys.length,
      sells: sells.length,
      closedRoundTrips: trips.length,
      realizedPnl: realized,
      wins,
      losses,
      winRatePct:
        wins + losses > 0
          ? Math.round((wins / (wins + losses)) * 1000) / 10
          : 0,
    },
    allTime: {
      realizedPnl: allTimeRealized,
      unrealizedPnl: Math.round(breakdown.unrealizedPnl * 100) / 100,
      allTimePnlInclOpen: Math.round(breakdown.allTimePnl * 100) / 100,
      returnPctOnStart:
        startingBalance > 0
          ? Math.round((allTimeRealized / startingBalance) * 10000) / 100
          : 0,
    },
    byStrategy: [...byStrat.entries()]
      .map(([strategy, v]) => ({
        strategy,
        sells: v.sells,
        realizedPnl: Math.round(v.realizedPnl * 100) / 100,
        wins: v.wins,
        losses: v.losses,
      }))
      .sort((a, b) => b.realizedPnl - a.realizedPnl),
  };
}
