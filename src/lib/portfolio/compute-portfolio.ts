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
  // Account value at cost — grows only via realized P&L (cash + cost basis), not mark-to-market.
  return {
    balance,
    invested,
    currentValue,
    pnl,
    pnlPercent,
    portfolioValue: balance + invested,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function positionKey(symbol: string, exchange: string): string {
  return `${symbol.trim().toUpperCase()}:${(exchange || "NSE").trim().toUpperCase()}`;
}

function buyCashOut(t: PaperTrade): number {
  const turnover = t.grossAmount ?? t.qty * t.price;
  return typeof t.charges === "number" ? turnover + t.charges : turnover;
}

function sellCashIn(t: PaperTrade): number {
  const turnover = t.grossAmount ?? t.qty * t.price;
  return typeof t.charges === "number" ? turnover - t.charges : turnover;
}

/** Legacy: sum of stored netPnl on SELL rows (incomplete when fields are missing). */
export function computeRealizedPnl(trades: PaperTrade[]): number {
  return trades.reduce((sum, t) => {
    if (t.side !== "SELL" || typeof t.netPnl !== "number") return sum;
    return sum + t.netPnl;
  }, 0);
}

/**
 * Realized P&L from matched BUY→SELL lots (FIFO).
 * Ignores orphan sells (cash credits with no buy still in history) so inflated
 * books cannot fake profits.
 */
export function computeFifoRealizedPnl(trades: PaperTrade[]): number {
  const sorted = [...trades].sort(
    (a, b) => tradeExecutedAtMs(a) - tradeExecutedAtMs(b)
  );
  const lots = new Map<string, { qty: number; costPerShare: number }[]>();
  let realized = 0;

  for (const t of sorted) {
    const key = positionKey(t.symbol, t.exchange);
    if (t.side === "BUY") {
      const list = lots.get(key) ?? [];
      const cashOut = buyCashOut(t);
      const costPerShare = t.qty > 0 ? cashOut / t.qty : t.price;
      list.push({ qty: Math.floor(t.qty), costPerShare });
      lots.set(key, list);
      continue;
    }

    let rem = Math.floor(t.qty);
    if (rem <= 0) continue;
    const proceedsPerShare = t.qty > 0 ? sellCashIn(t) / t.qty : t.price;
    const list = lots.get(key) ?? [];
    while (rem > 0 && list.length > 0) {
      const lot = list[0];
      const take = Math.min(rem, lot.qty);
      realized += (proceedsPerShare - lot.costPerShare) * take;
      lot.qty -= take;
      rem -= take;
      if (lot.qty <= 0) list.shift();
    }
    lots.set(key, list);
  }

  return round2(realized);
}

/** Cash that must remain after matched trading: start − invested + realized. */
export function deriveHonestCash(
  startingBalance: number,
  invested: number,
  realizedPnl: number
): number {
  return round2(startingBalance - Math.max(0, invested) + realizedPnl);
}

export interface PnlBreakdown {
  portfolio: PortfolioSummary;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  realizedPnl: number;
  allTimePnl: number;
  allTimePnlPercent: number;
  /** True when stored cash was replaced with the reconstructed honest balance. */
  cashRepaired: boolean;
  today: ReturnType<typeof computeTodayPnl>;
}

/**
 * Paper / algo money truth comes from stored cash + open holdings, not from a
 * truncated trade list. FIFO on capped history understates old realized P&L and
 * used to "repair" cash incorrectly when the history limit grew.
 *
 * Identity (always):
 *   realized ≈ cash − startingBalance + invested
 *   allTime  = cash + markToMarket(holdings) − startingBalance
 */
export function computePnlBreakdown(
  trades: PaperTrade[],
  holdings: PortfolioHolding[],
  balance: number,
  startingBalance: number,
  options?: {
    /**
     * When true, rebuild cash from FIFO trade history (legacy). Default false:
     * trust the persisted balance so old dropped trades cannot change totals.
     */
    reconstructCashFromTrades?: boolean;
  }
): PnlBreakdown {
  const invested = computeInvested(holdings);
  const storedCash = round2(balance ?? 0);
  const fifoRealized = computeFifoRealizedPnl(trades);
  const reconstruct = options?.reconstructCashFromTrades === true;

  let cash = storedCash;
  let realizedPnl = round2(storedCash - startingBalance + invested);
  let cashRepaired = false;

  if (reconstruct) {
    const honestCash = deriveHonestCash(startingBalance, invested, fifoRealized);
    cashRepaired = Math.abs(storedCash - honestCash) >= 1;
    cash = honestCash;
    realizedPnl = fifoRealized;
  }

  const portfolio = computePortfolio(holdings, cash);
  const allTimePnl = round2(
    cash + portfolio.currentValue - startingBalance
  );
  const allTimePnlPercent =
    startingBalance > 0 ? (allTimePnl / startingBalance) * 100 : 0;
  return {
    portfolio,
    unrealizedPnl: portfolio.pnl,
    unrealizedPnlPercent: portfolio.pnlPercent,
    realizedPnl,
    allTimePnl,
    allTimePnlPercent,
    cashRepaired,
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

export type PortfolioChartPeriod = "week" | "month" | "year";

export function portfolioChartWindowDays(period: PortfolioChartPeriod): number {
  if (period === "week") return 7;
  if (period === "month") return 30;
  return 365;
}

export function portfolioChartPeriodLabel(period: PortfolioChartPeriod): string {
  if (period === "week") return "Last 7 days (IST)";
  if (period === "month") return "Last 30 days (IST)";
  return "Last 12 months (IST)";
}

function shiftDateKeyIST(dateKey: string, days: number): string {
  const ms = new Date(`${dateKey}T12:00:00+05:30`).getTime() + days * 86_400_000;
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: IST });
}

function listDateKeysInclusive(fromKey: string, toKey: string): string[] {
  const keys: string[] = [];
  let key = fromKey;
  for (let i = 0; i < 400 && key <= toKey; i++) {
    keys.push(key);
    key = shiftDateKeyIST(key, 1);
  }
  return keys;
}

function formatChartLabel(dateKey: string, period: PortfolioChartPeriod): string {
  const d = new Date(`${dateKey}T12:00:00+05:30`);
  if (period === "year") {
    return d.toLocaleDateString("en-IN", {
      month: "short",
      year: "2-digit",
      timeZone: IST,
    });
  }
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: IST,
  });
}

/** Reconstruct cost-basis portfolio value after each trade (excludes unrealized). */
export function buildPortfolioChart(
  trades: PaperTrade[],
  balance: number,
  holdings: PortfolioHolding[],
  startingBalance: number,
  period: PortfolioChartPeriod = "week",
  now = new Date()
): { date: string; value: number }[] {
  const sorted = [...trades].sort(
    (a, b) => tradeExecutedAtMs(a) - tradeExecutedAtMs(b)
  );
  if (sorted.length === 0) return [];

  const lots = new Map<string, { qty: number; costPerShare: number }[]>();
  let runBalance = startingBalance;

  function investedAtCost(): number {
    let sum = 0;
    for (const list of lots.values()) {
      for (const lot of list) sum += lot.qty * lot.costPerShare;
    }
    return sum;
  }

  const daily = new Map<string, number>();
  for (const t of sorted) {
    const key = positionKey(t.symbol, t.exchange);
    if (t.side === "BUY") {
      runBalance -= buyCashOut(t);
      const list = lots.get(key) ?? [];
      const costPerShare = t.qty > 0 ? buyCashOut(t) / t.qty : t.price;
      list.push({ qty: t.qty, costPerShare });
      lots.set(key, list);
    } else {
      let sellQty = t.qty;
      const list = lots.get(key) ?? [];
      let matched = 0;
      while (sellQty > 0 && list.length > 0) {
        const lot = list[0];
        const take = Math.min(sellQty, lot.qty);
        lot.qty -= take;
        sellQty -= take;
        matched += take;
        if (lot.qty <= 0) list.shift();
      }
      lots.set(key, list);
      // Credit only matched shares — orphan sells must not inflate chart equity.
      if (matched > 0 && t.qty > 0) {
        runBalance += (sellCashIn(t) / t.qty) * matched;
      }
    }

    const ms = tradeExecutedAtMs(t);
    const dateKey =
      ms > 0
        ? new Date(ms).toLocaleDateString("en-CA", { timeZone: IST })
        : t.date || todayDateKeyIST(now);
    daily.set(dateKey, Math.round(runBalance + investedAtCost()));
  }

  const today = todayDateKeyIST(now);
  daily.set(
    today,
    Math.round(computePortfolio(holdings, balance).portfolioValue)
  );

  const windowDays = portfolioChartWindowDays(period);
  const windowStart = shiftDateKeyIST(today, -(windowDays - 1));
  const sortedKeys = [...daily.keys()].sort();
  let lastKnown = Math.round(startingBalance);
  for (const key of sortedKeys) {
    if (key < windowStart) lastKnown = daily.get(key) ?? lastKnown;
  }

  const series: { date: string; value: number; dateKey: string }[] = [];
  for (const dateKey of listDateKeysInclusive(windowStart, today)) {
    if (daily.has(dateKey)) lastKnown = daily.get(dateKey) ?? lastKnown;
    series.push({
      dateKey,
      date: formatChartLabel(dateKey, period),
      value: lastKnown,
    });
  }

  if (period !== "year") {
    return series.map(({ date, value }) => ({ date, value }));
  }

  const byMonth = new Map<string, { date: string; value: number }>();
  for (const point of series) {
    byMonth.set(point.dateKey.slice(0, 7), {
      date: formatChartLabel(point.dateKey, "year"),
      value: point.value,
    });
  }
  return [...byMonth.values()];
}
