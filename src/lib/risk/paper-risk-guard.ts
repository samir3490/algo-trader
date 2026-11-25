import type { AppSettings, PaperHolding, PaperTrade, PaperTradingState } from "@/lib/firebase";
import { normalizePaperTrades } from "@/lib/paper-trades/normalize";
import { executePortfolioDecision } from "@/lib/portfolio/order-engine";
import {
  paperBuyCashRequired,
  effectivePaperOrderCap,
  effectivePaperMinOrderValue,
} from "@/lib/portfolio/paper-position-size";
import {
  ensurePositions,
  getOpenPositions,
} from "@/lib/portfolio/position-manager";
import { mapRiskExitToReason, type PaperPosition } from "@/lib/portfolio/types";
import {
  cashFlowForTrade,
  computeZerodhaCharges,
  type ZerodhaProduct,
} from "@/lib/brokerage/zerodha-charges";

export type RiskExitReason =
  | "stop_loss"
  | "take_profit"
  | "mis_square_off"
  | "trailing_stop"
  | "max_hold_days"
  | "no_progress";

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
const MS_PER_DAY = 86_400_000;

export function holdingPnlPercent(avgPrice: number, ltp: number): number {
  if (avgPrice <= 0 || ltp <= 0) return 0;
  return ((ltp - avgPrice) / avgPrice) * 100;
}

export function daysHeldSince(entryTime: string, now = new Date()): number {
  const entryMs = Date.parse(entryTime);
  if (Number.isNaN(entryMs)) return 0;
  return (now.getTime() - entryMs) / MS_PER_DAY;
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

/** True when position or default product is MIS intraday. */
export function isMisProduct(
  product: string | undefined,
  settings: Pick<AppSettings, "paperDefaultProduct">
): boolean {
  const p = (product ?? settings.paperDefaultProduct ?? "CNC").toUpperCase();
  return p === "MIS";
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

  // No hard take-profit exit — winners use trailing stop (stage 1 ~+2%, stage 2 ~+5%).

  if (
    isMisProduct(settings.paperDefaultProduct, settings) &&
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

/** Stop loss — checked first on losses; overrides trailing stop and time exits. */
export function evaluateStopLossExit(
  position: PaperPosition,
  settings: Pick<AppSettings, "stopLossPercent" | "autoStopLoss">
): RiskExitSignal | null {
  const threshold = settings.stopLossPercent ?? 0;
  if (threshold <= 0 || settings.autoStopLoss === false) return null;

  const pnlPercent = holdingPnlPercent(position.entryPrice, position.ltp);
  if (pnlPercent <= -threshold) {
    return {
      symbol: position.symbol,
      exchange: position.exchange,
      reason: "stop_loss",
      message: `Stop loss hit (${pnlPercent.toFixed(2)}% ≤ -${threshold}%)`,
      pnlPercent,
    };
  }
  return null;
}

/** Peak P&L % used for trail arming (high-water mark vs entry). */
export function peakProfitPercent(
  position: Pick<PaperPosition, "entryPrice" | "ltp" | "peakPrice">
): number {
  const peak = Math.max(
    position.peakPrice ?? position.entryPrice,
    position.ltp
  );
  return holdingPnlPercent(position.entryPrice, peak);
}

/**
 * Stage-1 trail arms once peak ≥ ~+2% (stopLoss % or 2).
 * Stage-2 trail arms once peak ≥ take-profit % (default +5%) — not a hard exit.
 */
export function trailingArmThresholdPercent(
  settings: Pick<AppSettings, "takeProfitPercent" | "stopLossPercent">
): number {
  const stopLoss = settings.stopLossPercent ?? 0;
  if (stopLoss > 0) return Math.max(stopLoss, 1);
  const takeProfit = settings.takeProfitPercent ?? 0;
  return takeProfit > 0 ? takeProfit : 0;
}

/** Whether peak price has reached the stage-1 min-profit % (arms trailing stop). */
export function isTrailingStopArmed(
  position: Pick<PaperPosition, "entryPrice" | "ltp" | "peakPrice">,
  settings: Pick<AppSettings, "takeProfitPercent" | "stopLossPercent">
): boolean {
  const armAt = trailingArmThresholdPercent(settings);
  if (armAt <= 0) return true;
  return peakProfitPercent(position) >= armAt;
}

/**
 * Trail distance from peak:
 * - peak ≥ takeProfit% (e.g. +5%): trailingStopAfterTargetPercent (stage 2)
 * - else peak ≥ stage-1 arm (~+2%): trailingStopPercent (stage 1)
 */
export function resolveTrailingStopPercent(
  position: Pick<PaperPosition, "entryPrice" | "ltp" | "peakPrice">,
  settings: Pick<
    AppSettings,
    | "takeProfitPercent"
    | "stopLossPercent"
    | "trailingStopPercent"
    | "trailingStopAfterTargetPercent"
    | "autoTakeProfit"
  >
): number {
  const stage1 = settings.trailingStopPercent ?? 0;
  const stage2 =
    settings.trailingStopAfterTargetPercent ??
    settings.trailingStopPercent ??
    0;
  const target = settings.takeProfitPercent ?? 0;
  const peakPct = peakProfitPercent(position);
  // Stage 2: once peak has cleared the old hard-TP level, keep trailing (no hard exit).
  if (
    settings.autoTakeProfit !== false &&
    target > 0 &&
    peakPct >= target &&
    stage2 > 0
  ) {
    return stage2;
  }
  return stage1;
}

/** Whether a held position has reached the min-profit % gate for strategy SELL signals. */
export function meetsStrategySellProfitTarget(
  position: Pick<PaperPosition, "entryPrice" | "ltp">,
  settings: Pick<AppSettings, "takeProfitPercent">
): boolean {
  const target = settings.takeProfitPercent ?? 0;
  if (target <= 0) return true;
  return holdingPnlPercent(position.entryPrice, position.ltp) >= target;
}

/** Full position risk check: stop loss (first), trailing stop, optional fixed take profit, time exits, MIS square-off. */
export function evaluatePositionRiskExit(
  position: PaperPosition,
  settings: AppSettings,
  now = new Date()
): RiskExitSignal | null {
  const stopLoss = evaluateStopLossExit(position, settings);
  if (stopLoss) return stopLoss;

  const pnlPercent = holdingPnlPercent(position.entryPrice, position.ltp);
  const peak = Math.max(
    position.peakPrice ?? position.entryPrice,
    position.ltp
  );

  const trailPct = resolveTrailingStopPercent(position, settings);
  if (
    settings.autoTrailingStop &&
    trailPct > 0 &&
    peak > 0 &&
    isTrailingStopArmed(position, settings)
  ) {
    const floor = peak * (1 - trailPct / 100);
    if (position.ltp > 0 && position.ltp <= floor) {
      const peakPct = peakProfitPercent(position);
      const stage =
        settings.autoTakeProfit !== false &&
        (settings.takeProfitPercent ?? 0) > 0 &&
        peakPct >= (settings.takeProfitPercent ?? 0)
          ? `stage-2 ≥+${settings.takeProfitPercent}%`
          : `stage-1 ≥+${trailingArmThresholdPercent(settings)}%`;
      return {
        symbol: position.symbol,
        exchange: position.exchange,
        reason: "trailing_stop",
        message: `Trailing stop (${trailPct}% from peak ₹${peak.toFixed(2)}, ${stage})`,
        pnlPercent,
      };
    }
  }

  // No hard take-profit exit at +5% — stage-2 trailing locks gains instead.

  if (
    isMisProduct(position.product, settings) &&
    isPastMisSquareOff(settings.squareOffTime, now)
  ) {
    return {
      symbol: position.symbol,
      exchange: position.exchange,
      reason: "mis_square_off",
      message: `MIS square-off (${settings.squareOffTime} IST)`,
      pnlPercent,
    };
  }

  const heldDays = daysHeldSince(position.entryTime, now);

  if ((settings.maxHoldDays ?? 0) > 0 && heldDays >= (settings.maxHoldDays ?? 0)) {
    return {
      symbol: position.symbol,
      exchange: position.exchange,
      reason: "max_hold_days",
      message: `Max hold ${settings.maxHoldDays} days (${heldDays.toFixed(1)}d held)`,
      pnlPercent,
    };
  }

  const noProgressDays = settings.noProgressDays ?? 0;
  const minGain = settings.noProgressMinPct ?? 0.5;
  if (noProgressDays > 0 && heldDays >= noProgressDays && pnlPercent < minGain) {
    return {
      symbol: position.symbol,
      exchange: position.exchange,
      reason: "no_progress",
      message: `No progress: ${heldDays.toFixed(1)}d held, ${pnlPercent.toFixed(2)}% < ${minGain}%`,
      pnlPercent,
    };
  }

  return null;
}

/** Update peak LTP on open positions after a quote refresh. */
export function ratchetPositionPeakPrices(
  positions: PaperPosition[] | undefined,
  ltpByKey: Record<string, number>
): PaperPosition[] {
  return (positions ?? []).map((p) => {
    const key = `${p.symbol.trim().toUpperCase()}:${(p.exchange || "NSE").trim().toUpperCase()}`;
    const ltp = ltpByKey[key] ?? p.ltp;
    const peak = Math.max(p.peakPrice ?? p.entryPrice, ltp);
    return { ...p, ltp, peakPrice: peak };
  });
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
  qty?: number;
  price?: number;
}): { allowed: boolean; message?: string } {
  const {
    balance,
    orderValue,
    holdingsCount,
    settings,
    todayRealizedLoss = 0,
    qty,
    price,
  } = params;

  const cashNeeded =
    qty != null && price != null
      ? paperBuyCashRequired(qty, price, settings)
      : orderValue;

  if (cashNeeded > balance) {
    return { allowed: false, message: "Insufficient paper balance" };
  }
  const maxOrder = effectivePaperOrderCap(settings);
  if (maxOrder > 0 && orderValue > maxOrder) {
    return {
      allowed: false,
      message: `Order exceeds paper max per trade (₹${maxOrder})`,
    };
  }
  const minOrder = effectivePaperMinOrderValue(settings);
  if (minOrder > 0 && orderValue < minOrder) {
    return {
      allowed: false,
      message: `Order below paper min purchase (₹${minOrder})`,
    };
  }
  if (holdingsCount >= (settings.maxPositions ?? 10)) {
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
    const signal = evaluatePositionRiskExit(position, settings, now);
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
