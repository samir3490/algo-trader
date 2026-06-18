import type { PaperTrade } from "@/lib/firebase";
import type { PortfolioHolding } from "@/lib/portfolio/compute-portfolio";
import {
  computePnlBreakdown,
  todayDateKeyIST,
} from "@/lib/portfolio/compute-portfolio";

export interface DailyPnlReport {
  dateIST: string;
  startingBalance: number;
  portfolioValue: number;
  cashBalance: number;
  invested: number;
  todayRealizedPnl: number;
  todayTradeCount: number;
  unrealizedPnl: number;
  allTimePnl: number;
  allTimePnlPercent: number;
  openPositions: number;
  sellsToday: number;
  buysToday: number;
}

export function buildDailyPnlReport(
  trades: PaperTrade[],
  holdings: PortfolioHolding[],
  balance: number,
  startingBalance: number,
  now = new Date()
): DailyPnlReport {
  const breakdown = computePnlBreakdown(trades, holdings, balance, startingBalance);
  const today = todayDateKeyIST(now);
  const todayTrades = trades.filter((t) => {
    const d =
      t.date ??
      (t.executedAt
        ? new Date(t.executedAt).toLocaleDateString("en-CA", {
            timeZone: "Asia/Kolkata",
          })
        : "");
    return d === today;
  });

  const sellsToday = todayTrades.filter((t) => t.side === "SELL");
  const buysToday = todayTrades.filter((t) => t.side === "BUY");
  const todayRealizedPnl = sellsToday.reduce(
    (sum, t) => sum + (typeof t.netPnl === "number" ? t.netPnl : 0),
    0
  );

  return {
    dateIST: today,
    startingBalance,
    portfolioValue: breakdown.portfolio.portfolioValue,
    cashBalance: balance,
    invested: breakdown.portfolio.invested,
    todayRealizedPnl: Math.round(todayRealizedPnl * 100) / 100,
    todayTradeCount: todayTrades.length,
    unrealizedPnl: Math.round(breakdown.unrealizedPnl * 100) / 100,
    allTimePnl: Math.round(breakdown.allTimePnl * 100) / 100,
    allTimePnlPercent: Math.round(breakdown.allTimePnlPercent * 100) / 100,
    openPositions: holdings.length,
    sellsToday: sellsToday.length,
    buysToday: buysToday.length,
  };
}

export function shouldSendDailyPnlToday(
  lastSentDate: string | undefined,
  now = new Date()
): boolean {
  return lastSentDate !== todayDateKeyIST(now);
}
