import type { StrategySignal } from "@/types";
import type { PaperHolding, PaperTrade, PaperTradingState } from "@/lib/firebase";

const INITIAL_BALANCE = 1_000_000;

export function applyPaperSignal(
  state: PaperTradingState,
  signal: StrategySignal,
  exchange: string
): { state: PaperTradingState; executed: boolean; message?: string } {
  const sym = signal.symbol.toUpperCase();
  const qty = Math.max(1, Math.floor(signal.quantity || 1));
  const price = signal.price;
  const total = qty * price;

  const balance = state.balance ?? INITIAL_BALANCE;
  const holdings = [...(state.holdings ?? [])];
  const trades = [...(state.trades ?? [])];

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  if (signal.action === "BUY") {
    if (total > balance) {
      return { state, executed: false, message: "Insufficient paper balance" };
    }
    const existing = holdings.find(
      (h) => h.symbol === sym && h.exchange === exchange
    );
    if (existing) {
      const newQty = existing.qty + qty;
      existing.avgPrice =
        Math.round(((existing.avgPrice * existing.qty + total) / newQty) * 100) / 100;
      existing.qty = newQty;
      existing.ltp = price;
    } else {
      holdings.push({
        symbol: sym,
        exchange,
        qty,
        avgPrice: price,
        ltp: price,
      });
    }
    const newTrade: PaperTrade = {
      id: `strat-${Date.now()}`,
      time: timeStr,
      symbol: sym,
      exchange,
      side: "BUY",
      qty,
      price,
      date: now.toISOString().slice(0, 10),
    };
    const newState: PaperTradingState = {
      balance: balance - total,
      holdings,
      trades: [newTrade, ...trades].slice(0, 500),
    };
    return { state: newState, executed: true };
  }

  if (signal.action === "SELL") {
    const existing = holdings.find(
      (h) => h.symbol === sym && h.exchange === exchange
    );
    if (!existing || existing.qty < qty) {
      return { state, executed: false, message: "No holdings to sell" };
    }
    existing.qty -= qty;
    const newHoldings =
      existing.qty <= 0
        ? holdings.filter((h) => !(h.symbol === sym && h.exchange === exchange))
        : holdings;
    const newTrade: PaperTrade = {
      id: `strat-${Date.now()}`,
      time: timeStr,
      symbol: sym,
      exchange,
      side: "SELL",
      qty,
      price,
      date: now.toISOString().slice(0, 10),
    };
    const newState: PaperTradingState = {
      balance: balance + total,
      holdings: newHoldings,
      trades: [newTrade, ...trades].slice(0, 500),
    };
    return { state: newState, executed: true };
  }

  return { state, executed: false };
}
