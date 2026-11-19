import type { OrderRecord, PaperTrade } from "@/lib/firebase";
import { orderRecordToPaperTrade } from "@/lib/portfolio/paper-order-record";
import {
  computeTradePeriodTotals,
  type TradeDateRange,
} from "@/lib/portfolio/trade-period";
import { todayDateKeyIST } from "@/lib/portfolio/compute-portfolio";

const IST = "Asia/Kolkata";

export interface MonthlyLivePerformanceReport {
  monthKey: string;
  monthLabel: string;
  fromDateIST: string;
  toDateIST: string;
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  buyTurnover: number;
  sellTurnover: number;
  totalTurnover: number;
  realizedPnl: number;
  wins: number;
  losses: number;
  winRate: number;
  fees: number;
  topSymbols: { symbol: string; trades: number; buyQty: number; sellQty: number }[];
  topStrategies: { strategyName: string; trades: number; buys: number; sells: number }[];
}

function shiftMonthKey(year: number, monthIndex0: number, delta: number): {
  year: number;
  monthIndex0: number;
} {
  const d = new Date(Date.UTC(year, monthIndex0 + delta, 1));
  return { year: d.getUTCFullYear(), monthIndex0: d.getUTCMonth() };
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Previous calendar month in IST (relative to `now`). */
export function previousMonthRangeIST(now = new Date()): {
  monthKey: string;
  monthLabel: string;
  fromKey: string;
  toKey: string;
  range: TradeDateRange;
} {
  const todayIST = todayDateKeyIST(now);
  const [y, m] = todayIST.split("-").map(Number);
  const prev = shiftMonthKey(y, m - 1, -1);
  const lastDay = daysInMonth(prev.year, prev.monthIndex0);
  const fromKey = `${prev.year}-${pad2(prev.monthIndex0 + 1)}-01`;
  const toKey = `${prev.year}-${pad2(prev.monthIndex0 + 1)}-${pad2(lastDay)}`;
  const monthKey = `${prev.year}-${pad2(prev.monthIndex0 + 1)}`;
  const monthLabel = new Date(
    `${fromKey}T12:00:00+05:30`
  ).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: IST,
  });
  return {
    monthKey,
    monthLabel,
    fromKey,
    toKey,
    range: { fromKey, toKey },
  };
}

export function shouldSendMonthlyLiveEmail(
  lastMonthKey: string | undefined,
  targetMonthKey: string
): boolean {
  return lastMonthKey !== targetMonthKey;
}

function liveOrdersToTrades(orders: OrderRecord[]): PaperTrade[] {
  return orders
    .filter((o) => o.mode === "LIVE")
    .filter((o) => {
      const status = (o.status || "").toUpperCase();
      return !status || ["COMPLETE", "EXECUTED"].includes(status);
    })
    .map(orderRecordToPaperTrade);
}

export function buildMonthlyLivePerformanceReport(
  orders: OrderRecord[],
  now = new Date()
): MonthlyLivePerformanceReport {
  const { monthKey, monthLabel, fromKey, toKey, range } =
    previousMonthRangeIST(now);
  const trades = liveOrdersToTrades(orders);
  const totals = computeTradePeriodTotals(trades, range);

  const periodTrades = trades.filter((t) => {
    const key =
      t.date ||
      (t.executedAt
        ? new Date(t.executedAt).toLocaleDateString("en-CA", { timeZone: IST })
        : "");
    if (!key) return false;
    return key >= fromKey && key <= toKey;
  });

  const bySymbol = new Map<
    string,
    { symbol: string; trades: number; buyQty: number; sellQty: number }
  >();
  const byStrategy = new Map<
    string,
    { strategyName: string; trades: number; buys: number; sells: number }
  >();

  for (const t of periodTrades) {
    const sym = t.symbol.toUpperCase();
    const sRow = bySymbol.get(sym) ?? {
      symbol: sym,
      trades: 0,
      buyQty: 0,
      sellQty: 0,
    };
    sRow.trades += 1;
    if (t.side === "BUY") sRow.buyQty += t.qty;
    else sRow.sellQty += t.qty;
    bySymbol.set(sym, sRow);

    const name = (t.strategyName || "Manual").trim() || "Manual";
    const st = byStrategy.get(name) ?? {
      strategyName: name,
      trades: 0,
      buys: 0,
      sells: 0,
    };
    st.trades += 1;
    if (t.side === "BUY") st.buys += 1;
    else st.sells += 1;
    byStrategy.set(name, st);
  }

  const topSymbols = [...bySymbol.values()]
    .sort((a, b) => b.trades - a.trades)
    .slice(0, 10);
  const topStrategies = [...byStrategy.values()]
    .sort((a, b) => b.trades - a.trades)
    .slice(0, 10);

  return {
    monthKey,
    monthLabel,
    fromDateIST: fromKey,
    toDateIST: toKey,
    tradeCount: totals.tradeCount,
    buyCount: totals.buyCount,
    sellCount: totals.sellCount,
    buyTurnover: totals.buyTurnover,
    sellTurnover: totals.sellTurnover,
    totalTurnover: totals.totalTurnover,
    realizedPnl: totals.realizedPnl,
    wins: totals.wins,
    losses: totals.losses,
    winRate: totals.winRate,
    fees: totals.fees,
    topSymbols,
    topStrategies,
  };
}
