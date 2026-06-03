import type { StrategySignal } from "@/types";
import type { PaperHolding, PaperTrade, PaperTradingState } from "@/lib/firebase";

const INITIAL_BALANCE = 1_000_000;

function normSymbol(s: string): string {
  return s.trim().toUpperCase();
}

function normExchange(ex: string): string {
  return (ex || "NSE").trim().toUpperCase();
}

function findHolding(
  holdings: PaperHolding[],
  symbol: string,
  exchange: string
): PaperHolding | undefined {
  const sym = normSymbol(symbol);
  const ex = normExchange(exchange);
  return holdings.find(
    (h) => normSymbol(h.symbol) === sym && normExchange(h.exchange) === ex
  );
}

export function applyPaperSignal(
  state: PaperTradingState,
  signal: StrategySignal,
  exchange: string,
  meta?: { strategyId?: string; strategyName?: string; reason?: string }
): {
  state: PaperTradingState;
  executed: boolean;
  message?: string;
  executedQty?: number;
} {
  const sym = normSymbol(signal.symbol);
  const ex = normExchange(exchange);
  const qty = Math.max(1, Math.floor(signal.quantity || 1));
  const price = signal.price;
  const total = qty * price;

  const balance = state.balance ?? INITIAL_BALANCE;
  const holdings = [...(state.holdings ?? [])];
  const trades = [...(state.trades ?? [])];

  const now = new Date();
  const executedAt = now.toISOString();
  const timeStr = now.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const dateStr = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  if (signal.action === "BUY") {
    if (total > balance) {
      return { state, executed: false, message: "Insufficient paper balance" };
    }
    const existing = findHolding(holdings, sym, ex);
    if (existing) {
      const newQty = existing.qty + qty;
      existing.avgPrice =
        Math.round(((existing.avgPrice * existing.qty + total) / newQty) * 100) / 100;
      existing.qty = newQty;
      existing.ltp = price;
    } else {
      holdings.push({
        symbol: sym,
        exchange: ex,
        qty,
        avgPrice: price,
        ltp: price,
      });
    }
    const newTrade: PaperTrade = {
      id: `strat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sym}`,
      time: timeStr,
      executedAt,
      symbol: sym,
      exchange: ex,
      side: "BUY",
      qty,
      price,
      date: dateStr,
      strategyId: meta?.strategyId,
      strategyName: meta?.strategyName,
      reason: meta?.reason ?? signal.reason,
    };
    const newState: PaperTradingState = {
      balance: balance - total,
      holdings,
      trades: [newTrade, ...trades].slice(0, 500),
    };
    return { state: newState, executed: true, executedQty: qty };
  }

  if (signal.action === "SELL") {
    const existing = findHolding(holdings, sym, ex);
    if (!existing || existing.qty <= 0) {
      return { state, executed: false, message: "No holdings to sell" };
    }
    const sellQty = Math.min(qty, existing.qty);
    const sellTotal = sellQty * price;
    existing.qty -= sellQty;
    const newHoldings =
      existing.qty <= 0
        ? holdings.filter(
            (h) => !(normSymbol(h.symbol) === sym && normExchange(h.exchange) === ex)
          )
        : holdings;
    const newTrade: PaperTrade = {
      id: `strat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sym}`,
      time: timeStr,
      executedAt,
      symbol: sym,
      exchange: ex,
      side: "SELL",
      qty: sellQty,
      price,
      date: dateStr,
      strategyId: meta?.strategyId,
      strategyName: meta?.strategyName,
      reason: meta?.reason ?? signal.reason,
    };
    const newState: PaperTradingState = {
      balance: balance + sellTotal,
      holdings: newHoldings,
      trades: [newTrade, ...trades].slice(0, 500),
    };
    return { state: newState, executed: true, executedQty: sellQty };
  }

  return { state, executed: false };
}
