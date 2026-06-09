import type { PaperTrade, PaperTradingState } from "@/lib/firebase";
import {
  cashFlowForTrade,
  computeZerodhaCharges,
  type ZerodhaProduct,
} from "@/lib/brokerage/zerodha-charges";
import { normalizePaperTrades } from "@/lib/paper-trades/normalize";
import {
  addPositionToState,
  closePositionInState,
  createOpenPosition,
  ensurePositions,
} from "./position-manager";
import type { ExitReason, PortfolioDecision } from "./types";

const INITIAL_BALANCE = 1_000_000;
const IST = "Asia/Kolkata";

export interface OrderEngineOptions {
  simulateBrokerage?: boolean;
  product?: ZerodhaProduct;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildTrade(
  side: "BUY" | "SELL",
  sym: string,
  ex: string,
  qty: number,
  price: number,
  decision: PortfolioDecision,
  product: ZerodhaProduct,
  extra?: Partial<PaperTrade>
): PaperTrade {
  const now = new Date();
  return {
    id: `strat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sym}`,
    time: now.toLocaleString("en-IN", {
      timeZone: IST,
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
    date: now.toLocaleDateString("en-CA", { timeZone: IST }),
    strategyId: decision.ownerStrategyId,
    ownerStrategyId: decision.ownerStrategyId,
    strategyName: decision.ownerStrategyName,
    reason: decision.signalReason,
    product,
    ...extra,
  };
}

/**
 * Order engine — only path that mutates positions + balance from portfolio decisions.
 */
export function executePortfolioDecision(
  state: PaperTradingState,
  decision: PortfolioDecision,
  options?: OrderEngineOptions
): {
  state: PaperTradingState;
  executed: boolean;
  message?: string;
  executedQty?: number;
  trade?: PaperTrade;
} {
  if (decision.action !== "BUY" && decision.action !== "SELL") {
    return { state, executed: false, message: decision.skipReason ?? "No action" };
  }

  let current = ensurePositions(state);
  const sym = decision.symbol.trim().toUpperCase();
  const ex = (decision.exchange || "NSE").trim().toUpperCase();
  const qty = Math.max(1, Math.floor(decision.quantity || 1));
  const price = decision.price;
  const product = (options?.product ?? "CNC") as ZerodhaProduct;
  const simulate = options?.simulateBrokerage === true;
  const balance = current.balance ?? INITIAL_BALANCE;
  const trades = [...(current.trades ?? [])];

  if (decision.action === "BUY") {
    const turnover = qty * price;
    const charges = simulate
      ? computeZerodhaCharges({ side: "BUY", qty, price, product })
      : null;
    const cashOut = simulate
      ? cashFlowForTrade("BUY", turnover, charges!)
      : turnover;

    if (cashOut > balance) {
      return { state: current, executed: false, message: "Insufficient balance" };
    }

    const costPerShare = cashOut / qty;
    const position = createOpenPosition({
      symbol: sym,
      exchange: ex,
      quantity: qty,
      entryPrice: round2(costPerShare),
      ltp: price,
      ownerStrategyId: decision.ownerStrategyId,
      ownerStrategyName: decision.ownerStrategyName,
      signalReason: decision.signalReason,
      product,
    });

    const newTrade = buildTrade("BUY", sym, ex, qty, price, decision, product, {
      grossAmount: turnover,
      entryTime: position.entryTime,
      entryPrice: position.entryPrice,
      ...(charges
        ? {
            charges: charges.total,
            brokerage: charges.brokerage,
            stt: charges.stt,
            gst: charges.gst,
          }
        : {}),
    });

    current = addPositionToState(current, position);
    return {
      state: {
        ...current,
        balance: round2(balance - cashOut),
        trades: normalizePaperTrades([newTrade, ...trades], []).slice(0, 500),
      },
      executed: true,
      executedQty: qty,
      trade: newTrade,
    };
  }

  if (!decision.positionId) {
    return { state: current, executed: false, message: "No position to exit" };
  }

  const sellQty = qty;
  const sellTurnover = sellQty * price;
  const charges = simulate
    ? computeZerodhaCharges({ side: "SELL", qty: sellQty, price, product })
    : null;
  const cashIn = simulate
    ? -cashFlowForTrade("SELL", sellTurnover, charges!)
    : sellTurnover;

  const closed = closePositionInState(
    current,
    decision.positionId,
    price,
    (decision.exitReason ?? "OWNER_STRATEGY_EXIT") as ExitReason,
    sellQty
  );
  if (closed.closedQty <= 0 || !closed.position) {
    return { state: current, executed: false, message: "Failed to close position" };
  }

  const pos = closed.position;
  const costBasis = pos.entryPrice * closed.closedQty;
  const netPnl = round2(cashIn - costBasis);

  const newTrade = buildTrade(
    "SELL",
    sym,
    ex,
    closed.closedQty,
    price,
    decision,
    product,
    {
      grossAmount: sellTurnover,
      netPnl,
      exitReason: decision.exitReason ?? "OWNER_STRATEGY_EXIT",
      entryTime: pos.entryTime,
      entryPrice: pos.entryPrice,
      exitTime: pos.exitTime,
      exitPrice: price,
      ...(charges
        ? {
            charges: charges.total,
            brokerage: charges.brokerage,
            stt: charges.stt,
            gst: charges.gst,
          }
        : {}),
    }
  );

  return {
    state: {
      ...closed.state,
      balance: round2(balance + cashIn),
      trades: normalizePaperTrades([newTrade, ...trades], []).slice(0, 500),
    },
    executed: true,
    executedQty: closed.closedQty,
    trade: newTrade,
  };
}
