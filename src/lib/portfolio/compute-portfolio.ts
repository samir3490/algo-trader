import type { PaperTrade } from "@/lib/firebase";
import { tradeExecutedAtMs } from "@/lib/paper-trades/normalize";

const IST = "Asia/Kolkata";

export interface PortfolioHolding {
  symbol: string;
  exchange: string;
  qty: number;
  avgPrice: number;
  ltp: number;
}

export interface PortfolioSummary {
  balance: number;
  invested: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  portfolioValue: number;
}

export function todayDateKeyIST(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: IST });
}

export function tradeDateKeyIST(t: PaperTrade): string {
  const ms = tradeExecutedAtMs(t);
  if (ms > 0) {
    return new Date(ms).toLocaleDateString("en-CA", { timeZone: IST });
  }
  return t.date ?? "";
}

export function isTradeTodayIST(t: PaperTrade, today = todayDateKeyIST()): boolean {
  const key = tradeDateKeyIST(t);
  return key.length > 0 && key === today;
}

/** Cost basis deployed in open positions (always non-negative). */
export function computeInvested(holdings: PortfolioHolding[]): number {
  return holdings.reduce((sum, h) => sum + Math.max(0, h.qty) * Math.max(0, h.avgPrice), 0);
}

export function computePortfolio(
  holdings: PortfolioHolding[],
  balance: number
): PortfolioSummary {
  const invested = computeInvested(holdings);
  const currentValue = holdings.reduce(
    (sum, h) => sum + h.qty * (h.ltp > 0 ? h.ltp : h.avgPrice),
    0
  );
  const pnl = currentValue - invested;
  const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;
  return {
    balance,
    invested,
    currentValue,
    pnl,
    pnlPercent,
    portfolioValue: balance + currentValue,
  };
}

/** Sum of net P&L from all closed (SELL) trades. */
export function computeRealizedPnl(trades: PaperTrade[]): number {
  return trades.reduce((sum, t) => {
    if (t.side !== "SELL" || typeof t.netPnl !== "number") return sum;
    return sum + t.netPnl;
  }, 0);
}

export interface PnlBreakdown {
  portfolio: PortfolioSummary;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  realizedPnl: number;
  allTimePnl: number;
  allTimePnlPercent: number;
  today: ReturnType<typeof computeTodayPnl>;
}

export function computePnlBreakdown(
  trades: PaperTrade[],
  holdings: PortfolioHolding[],
  balance: number,
  startingBalance: number
): PnlBreakdown {
  const portfolio = computePortfolio(holdings, balance);
  const realizedPnl = computeRealizedPnl(trades);
  const allTimePnl = computeAllTimePnl(portfolio.portfolioValue, startingBalance);
  const allTimePnlPercent =
    startingBalance > 0 ? (allTimePnl / startingBalance) * 100 : 0;
  return {
    portfolio,
    unrealizedPnl: portfolio.pnl,
    unrealizedPnlPercent: portfolio.pnlPercent,
    realizedPnl,
    allTimePnl,
    allTimePnlPercent,
    today: computeTodayPnl(trades, holdings),
  };
}

export function computeAllTimePnl(portfolioValue: number, startingBalance: number): number {
  return portfolioValue - startingBalance;
}

/**
 * Realized P&L from sells closed today (IST). Buys are capital deployment, not loss.
 * Falls back to mark-to-market unrealized on holdings when there are no sells today.
 */
export function computeTodayPnl(
  trades: PaperTrade[],
  holdings: PortfolioHolding[]
): { pnl: number; tradeCount: number; mode: "realized" | "unrealized" | "none" } {
  const today = todayDateKeyIST();
  const todayTrades = trades.filter((t) => isTradeTodayIST(t, today));
  const sellsToday = todayTrades.filter((t) => t.side === "SELL");

  if (sellsToday.length > 0) {
    const pnl = sellsToday.reduce((sum, t) => {
      if (typeof t.netPnl === "number") return sum + t.netPnl;
      return sum;
    }, 0);
    return { pnl, tradeCount: todayTrades.length, mode: "realized" };
  }

  if (todayTrades.length > 0) {
    return { pnl: 0, tradeCount: todayTrades.length, mode: "none" };
  }

  if (holdings.length > 0) {
    const { pnl } = computePortfolio(holdings, 0);
    return { pnl, tradeCount: 0, mode: "unrealized" };
  }

  return { pnl: 0, tradeCount: 0, mode: "none" };
}

export function buildPortfolioChart(
  trades: PaperTrade[],
  balance: number,
  holdings: PortfolioHolding[],
  startingBalance: number
): { date: string; value: number }[] {
  if (trades.length === 0) return [];

  const { portfolioValue } = computePortfolio(holdings, balance);
  const numPoints = Math.min(Math.max(trades.length, 2), 30);

  const points: { date: string; value: number }[] = [];
  for (let i = 0; i < numPoints - 1; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (numPoints - 1 - i));
    const progress = i / Math.max(numPoints - 1, 1);
    points.push({
      date: date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
      value: Math.round(startingBalance + (portfolioValue - startingBalance) * progress),
    });
  }

  points.push({
    date: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
    value: Math.round(portfolioValue),
  });

  return points;
}
