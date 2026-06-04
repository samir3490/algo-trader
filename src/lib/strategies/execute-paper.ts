import type { StrategySignal } from "@/types";
import type { PaperHolding, PaperTrade, PaperTradingState } from "@/lib/firebase";
import {
  cashFlowForTrade,
  computeZerodhaCharges,
  type ZerodhaProduct,
} from "@/lib/brokerage/zerodha-charges";

const INITIAL_BALANCE = 1_000_000;

export interface ApplyPaperOptions {
  simulateBrokerage?: boolean;
  product?: ZerodhaProduct;
}

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

function buildTradeBase(
  sym: string,
  ex: string,
  side: "BUY" | "SELL",
  qty: number,
  price: number,
  meta?: { strategyId?: string; strategyName?: string; reason?: string },
  product?: ZerodhaProduct
): Omit<PaperTrade, "charges" | "grossAmount"> {
  const now = new Date();
  return {
    id: `strat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sym}`,
    time: now.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
    executedAt: now.toISOString(),
    symbol: sym,
    exchange: ex,
    side,
    qty,
    price,
    date: now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
    strategyId: meta?.strategyId,
    strategyName: meta?.strategyName,
    reason: meta?.reason,
    product: product ?? "CNC",
  };
}

export function applyPaperSignal(
  state: PaperTradingState,
  signal: StrategySignal,
  exchange: string,
  meta?: { strategyId?: string; strategyName?: string; reason?: string },
  options?: ApplyPaperOptions
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
  const turnover = qty * price;
  const product = (options?.product ?? "CNC") as ZerodhaProduct;
  const simulate = options?.simulateBrokerage === true;

  const balance = state.balance ?? INITIAL_BALANCE;
  const holdings = [...(state.holdings ?? [])];
  const trades = [...(state.trades ?? [])];

  if (signal.action === "BUY") {
    const charges = simulate
      ? computeZerodhaCharges({ side: "BUY", qty, price, product })
      : null;
    const cashOut = simulate
      ? cashFlowForTrade("BUY", turnover, charges!)
      : turnover;

    if (cashOut > balance) {
      return {
        state,
        executed: false,
        message: simulate
          ? "Insufficient balance (incl. charges)"
          : "Insufficient paper balance",
      };
    }

    const costPerShare = cashOut / qty;
    const existing = findHolding(holdings, sym, ex);
    if (existing) {
      const newQty = existing.qty + qty;
      existing.avgPrice =
        Math.round(
          ((existing.avgPrice * existing.qty + costPerShare * qty) / newQty) * 100
        ) / 100;
      existing.qty = newQty;
      existing.ltp = price;
    } else {
      holdings.push({
        symbol: sym,
        exchange: ex,
        qty,
        avgPrice: Math.round(costPerShare * 100) / 100,
        ltp: price,
      });
    }

    const newTrade: PaperTrade = {
      ...buildTradeBase(sym, ex, "BUY", qty, price, meta, product),
      grossAmount: turnover,
      ...(charges
        ? {
            charges: charges.total,
            brokerage: charges.brokerage,
            stt: charges.stt,
            gst: charges.gst,
          }
        : {}),
    };

    return {
      state: {
        balance: round2(balance - cashOut),
        holdings,
        trades: [newTrade, ...trades].slice(0, 500),
      },
      executed: true,
      executedQty: qty,
    };
  }

  if (signal.action === "SELL") {
    const existing = findHolding(holdings, sym, ex);
    if (!existing || existing.qty <= 0) {
      return { state, executed: false, message: "No holdings to sell" };
    }
    const sellQty = Math.min(qty, existing.qty);
    const sellTurnover = sellQty * price;
    const charges = simulate
      ? computeZerodhaCharges({ side: "SELL", qty: sellQty, price, product })
      : null;
    const cashIn = simulate
      ? -cashFlowForTrade("SELL", sellTurnover, charges!)
      : sellTurnover;

    const costBasis = existing.avgPrice * sellQty;
    const netPnl = round2(cashIn - costBasis);

    existing.qty -= sellQty;
    const newHoldings =
      existing.qty <= 0
        ? holdings.filter(
            (h) => !(normSymbol(h.symbol) === sym && normExchange(h.exchange) === ex)
          )
        : holdings;

    const newTrade: PaperTrade = {
      ...buildTradeBase(sym, ex, "SELL", sellQty, price, meta, product),
      grossAmount: sellTurnover,
      netPnl,
      ...(charges
        ? {
            charges: charges.total,
            brokerage: charges.brokerage,
            stt: charges.stt,
            gst: charges.gst,
          }
        : {}),
    };

    return {
      state: {
        balance: round2(balance + cashIn),
        holdings: newHoldings,
        trades: [newTrade, ...trades].slice(0, 500),
      },
      executed: true,
      executedQty: sellQty,
    };
  }

  return { state, executed: false };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
