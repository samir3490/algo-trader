import type { AppSettings, PaperHolding, PaperTrade, PaperTradingState } from "@/lib/firebase";
import { normalizePaperTrades } from "@/lib/paper-trades/normalize";
import { executePortfolioDecision } from "@/lib/portfolio/order-engine";
import { paperOrderNotional } from "@/lib/portfolio/paper-position-size";
import {
  ensurePositions,
  getOpenPositions,
} from "@/lib/portfolio/position-manager";
import { mapRiskExitToReason } from "@/lib/portfolio/types";
import {
  cashFlowForTrade,
  computeZerodhaCharges,
  type ZerodhaProduct,
} from "@/lib/brokerage/zerodha-charges";

export type RiskExitReason = "stop_loss" | "take_profit" | "mis_square_off";

export interface RiskExitSignal {
  symbol: string;
  exchange: string;
  reason: RiskExitReason;
  message: string;
  pnlPercent: number;
  qty?: number;
  price?: number;
}

export interface PaperHoldingLike {
  symbol: string;
  exchange: string;
  qty: number;
  avgPrice: number;
  ltp: number;
}

const IST = "Asia/Kolkata";

export function holdingPnlPercent(avgPrice: number, ltp: number): number {
  if (avgPrice <= 0 || ltp <= 0) return 0;
  return ((ltp - avgPrice) / avgPrice) * 100;
}

/** Whether current IST time is at or past square-off (HH:mm). */
export function isPastMisSquareOff(squareOffTime: string, now = new Date()): boolean {
  const [hh, mm] = squareOffTime.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return false;
  const ist = new Date(
    now.toLocaleString("en-US", { timeZone: IST })
  );
  const minutes = ist.getHours() * 60 + ist.getMinutes();
  return minutes >= hh * 60 + mm;
}

export function evaluateHoldingRiskExit(
  holding: PaperHoldingLike,
  settings: Pick<
    AppSettings,
    | "stopLossPercent"
    | "takeProfitPercent"
    | "autoStopLoss"
    | "autoTakeProfit"
    | "squareOffTime"
    | "paperDefaultProduct"
  >,
  now = new Date()
): RiskExitSignal | null {
  const pnlPercent = holdingPnlPercent(holding.avgPrice, holding.ltp);

  if (settings.autoStopLoss && settings.stopLossPercent > 0) {
    if (pnlPercent <= -settings.stopLossPercent) {
      return {
        symbol: holding.symbol,
        exchange: holding.exchange,
        reason: "stop_loss",
        message: `Stop loss hit (${pnlPercent.toFixed(2)}% ≤ -${settings.stopLossPercent}%)`,
        pnlPercent,
      };
    }
  }

  if (settings.autoTakeProfit && settings.takeProfitPercent > 0) {
    if (pnlPercent >= settings.takeProfitPercent) {
      return {
        symbol: holding.symbol,
        exchange: holding.exchange,
        reason: "take_profit",
        message: `Take profit hit (${pnlPercent.toFixed(2)}% ≥ ${settings.takeProfitPercent}%)`,
        pnlPercent,
      };
    }
  }

  if (
    settings.paperDefaultProduct === "MIS" &&
    isPastMisSquareOff(settings.squareOffTime, now)
  ) {
    return {
      symbol: holding.symbol,
      exchange: holding.exchange,
      reason: "mis_square_off",
      message: `MIS square-off (${settings.squareOffTime} IST)`,
      pnlPercent,
    };
  }

  return null;
}

export function scanPaperHoldingsForRiskExits(
  holdings: PaperHoldingLike[],
  settings: AppSettings,
  now = new Date()
): RiskExitSignal[] {
  return holdings
    .map((h) => evaluateHoldingRiskExit(h, settings, now))
    .filter((x): x is RiskExitSignal => x != null);
}

export function canPlacePaperBuy(params: {
  balance: number;
  orderValue: number;
  holdingsCount: number;
  settings: AppSettings;
  todayRealizedLoss?: number;
}): { allowed: boolean; message?: string } {
  const { balance, orderValue, holdingsCount, settings, todayRealizedLoss = 0 } =
    params;

  if (orderValue > balance) {
    return { allowed: false, message: "Insufficient paper balance" };
  }
  const maxOrder = Math.max(
    settings.maxOrderValue ?? 0,
    paperOrderNotional(settings)
  );
  if (maxOrder > 0 && orderValue > maxOrder) {
    return {
      allowed: false,
      message: `Order exceeds max order value (${maxOrder})`,
    };
  }
  if (holdingsCount >= settings.maxPositions) {
    return {
      allowed: false,
      message: `Max positions (${settings.maxPositions}) reached`,
    };
  }
  if (
    settings.maxDailyLoss > 0 &&
    todayRealizedLoss >= settings.maxDailyLoss
  ) {
    return {
      allowed: false,
      message: `Max daily loss (${settings.maxDailyLoss}) reached`,
    };
  }
  return { allowed: true };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Execute full exit for one holding; returns updated paper state. */
export function paperSellHolding(
  state: PaperTradingState,
  holding: PaperHolding,
  meta: { reason: string; product?: string },
  options?: { simulateBrokerage?: boolean; product?: ZerodhaProduct }
): { state: PaperTradingState; trade: PaperTrade } | null {
  if (!holding.qty || holding.qty <= 0) return null;

  const price = holding.ltp > 0 ? holding.ltp : holding.avgPrice;
  const sym = holding.symbol.trim().toUpperCase();
  const ex = (holding.exchange || "NSE").trim().toUpperCase();
  const sellQty = holding.qty;
  const sellTurnover = sellQty * price;
  const product = (options?.product ?? meta.product ?? "CNC") as ZerodhaProduct;
  const simulate = options?.simulateBrokerage === true;

  const charges = simulate
    ? computeZerodhaCharges({ side: "SELL", qty: sellQty, price, product })
    : null;
  const cashIn = simulate
    ? -cashFlowForTrade("SELL", sellTurnover, charges!)
    : sellTurnover;
  const costBasis = holding.avgPrice * sellQty;
  const netPnl = round2(cashIn - costBasis);

  const now = new Date();
  const executedAt = now.toISOString();
  const timeStr = now.toLocaleString("en-IN", {
    timeZone: IST,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const dateStr = now.toLocaleDateString("en-CA", { timeZone: IST });

  const newTrade: PaperTrade = {
    id: `risk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sym}`,
    time: timeStr,
    executedAt,
    symbol: sym,
    exchange: ex,
    side: "SELL",
    qty: sellQty,
    price,
    date: dateStr,
    strategyName: "Risk guard",
    reason: meta.reason,
    product,
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

  const balance = round2((state.balance ?? 0) + cashIn);
  const holdings = (state.holdings ?? []).filter(
    (h) =>
      !(
        h.symbol.trim().toUpperCase() === sym &&
        (h.exchange || "NSE").trim().toUpperCase() === ex
      )
  );
  const trades = normalizePaperTrades(
    [newTrade, ...(state.trades ?? [])],
    []
  );

  return {
    state: { balance, holdings, trades },
    trade: newTrade,
  };
}

export function applyPaperRiskExits(
  state: PaperTradingState,
  settings: AppSettings,
  now = new Date()
): { state: PaperTradingState; exits: RiskExitSignal[] } {
  let current = ensurePositions(state);
  const exits: RiskExitSignal[] = [];
  const open = getOpenPositions(current);

  for (const position of open) {
    const holdingLike: PaperHoldingLike = {
      symbol: position.symbol,
      exchange: position.exchange,
      qty: position.quantity,
      avgPrice: position.entryPrice,
      ltp: position.ltp,
    };
    const signal = evaluateHoldingRiskExit(holdingLike, settings, now);
    if (!signal) continue;

    const exitReason = mapRiskExitToReason(signal.reason);
    const price = position.ltp > 0 ? position.ltp : position.entryPrice;
    const result = executePortfolioDecision(
      current,
      {
        action: "SELL",
        symbol: position.symbol,
        exchange: position.exchange,
        ownerStrategyId: position.ownerStrategyId,
        ownerStrategyName: position.ownerStrategyName ?? "Risk guard",
        price,
        quantity: position.quantity,
        signalReason: signal.message,
        exitReason:
          signal.reason === "mis_square_off" ? "MIS_SQUARE_OFF" : exitReason,
        positionId: position.id,
      },
      {
        simulateBrokerage: settings.simulateBrokerage,
        product: settings.paperDefaultProduct,
      }
    );

    if (result.executed && result.trade) {
      current = result.state;
      exits.push({
        ...signal,
        qty: result.trade.qty,
        price: result.trade.price,
      });
    }
  }

  if (open.length === 0) {
    for (const signal of scanPaperHoldingsForRiskExits(
      current.holdings ?? [],
      settings,
      now
    )) {
      const holding = (current.holdings ?? []).find(
        (h) =>
          h.symbol.trim().toUpperCase() === signal.symbol.trim().toUpperCase() &&
          (h.exchange || "NSE").trim().toUpperCase() ===
            (signal.exchange || "NSE").trim().toUpperCase()
      );
      if (!holding) continue;

      const result = paperSellHolding(
        current,
        holding,
        {
          reason: signal.message,
          product: settings.paperDefaultProduct,
        },
        {
          simulateBrokerage: settings.simulateBrokerage,
          product: settings.paperDefaultProduct,
        }
      );
      if (result) {
        current = result.state;
        exits.push({
          ...signal,
          qty: result.trade.qty,
          price: result.trade.price,
        });
      }
    }
  }

  return { state: current, exits };
}
