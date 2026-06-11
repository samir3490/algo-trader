import type { AppSettings, PaperTradingState } from "@/lib/firebase";
import type { ScanSignal } from "@/lib/strategies/scan-signals";
import type { ActiveStrategy } from "@/lib/firebase";
import {
  detectStrategyConflicts,
  opinionsBlockedByConflict,
} from "./conflict-detector";
import {
  canStrategyExitPosition,
  canStrategyOpenPosition,
  hasOpenPositionForSymbol,
} from "./position-manager";
import type {
  PortfolioDecision,
  StrategyConflict,
  StrategyOpinion,
} from "./types";
import { resolvePaperOrderQty } from "./paper-position-size";
import {
  effectivePaperMaxOrderValue,
} from "./buy-selection";

export interface PortfolioContext {
  state: PaperTradingState;
  settings: AppSettings;
  multiStrategyMode?: boolean;
  todayRealizedLoss?: number;
}

function symKey(symbol: string, exchange: string): string {
  return `${symbol.trim().toUpperCase()}:${(exchange || "NSE").trim().toUpperCase()}`;
}

export function scanSignalToOpinion(
  sig: ScanSignal,
  strat: ActiveStrategy,
  settings: AppSettings,
  balance?: number
): StrategyOpinion {
  const action = sig.action as "BUY" | "SELL" | "HOLD";
  const quantity =
    action === "BUY"
      ? resolvePaperOrderQty(sig.price, settings, {
          strategyParams: strat.params,
          balance,
        })
      : strat.params?.quantity ?? 1;

  return {
    strategyId: sig.strategyId,
    strategyName: strat.name,
    symbol: sig.symbol,
    exchange: strat.exchange || "NSE",
    action,
    price: sig.price,
    quantity,
    reason: sig.reason,
    confidence: sig.confidence ?? 0,
  };
}

/**
 * Portfolio-level decision layer: strategies advise, PortfolioManager decides.
 */
function consolidateBuyOpinions(opinions: StrategyOpinion[]): StrategyOpinion[] {
  const buyCounts = new Map<string, number>();
  const bestBuy = new Map<string, StrategyOpinion>();

  for (const op of opinions) {
    if (op.action !== "BUY") continue;
    const key = symKey(op.symbol, op.exchange);
    buyCounts.set(key, (buyCounts.get(key) ?? 0) + 1);
    const existing = bestBuy.get(key);
    if (!existing || op.confidence > existing.confidence) {
      bestBuy.set(key, op);
    }
  }

  return [...bestBuy.values()].map((op) => ({
    ...op,
    buySignalCount: buyCounts.get(symKey(op.symbol, op.exchange)) ?? 1,
  }));
}

/** Paper auto-trade: entries from BUY signals only; exits via stop-loss / take-profit. */
export function buyOnlyOpinions(opinions: StrategyOpinion[]): StrategyOpinion[] {
  return opinions.filter((o) => o.action === "BUY");
}

export function evaluatePortfolioDecisions(
  opinions: StrategyOpinion[],
  ctx: PortfolioContext
): {
  decisions: PortfolioDecision[];
  conflicts: StrategyConflict[];
} {
  const mergedOpinions = consolidateBuyOpinions(opinions).sort(
    (a, b) => (b.buySignalCount ?? 0) - (a.buySignalCount ?? 0)
  );
  const conflicts = detectStrategyConflicts(mergedOpinions);
  const blocked = opinionsBlockedByConflict(mergedOpinions, conflicts, (symbol, exchange) =>
    hasOpenPositionForSymbol(ctx.state, symbol, exchange)
  );
  const decisions: PortfolioDecision[] = [];
  const multi = ctx.multiStrategyMode === true;

  let remainingBalance = ctx.state.balance ?? 0;
  const maxOrder = effectivePaperMaxOrderValue(ctx.settings);

  for (const op of mergedOpinions) {
    if (op.action === "HOLD") {
      decisions.push({
        action: "HOLD",
        symbol: op.symbol,
        exchange: op.exchange,
        ownerStrategyId: op.strategyId,
        ownerStrategyName: op.strategyName,
        price: op.price,
        quantity: op.quantity,
        signalReason: op.reason,
      });
      continue;
    }

    const blockKey = `${op.strategyId}:${symKey(op.symbol, op.exchange)}:${op.action}`;
    if (blocked.has(blockKey)) {
      decisions.push({
        action: "SKIP",
        symbol: op.symbol,
        exchange: op.exchange,
        ownerStrategyId: op.strategyId,
        ownerStrategyName: op.strategyName,
        price: op.price,
        quantity: op.quantity,
        signalReason: op.reason,
        skipReason: "CONFLICTING_STRATEGY_SIGNAL — not auto-executed",
      });
      continue;
    }

    if (op.action === "BUY") {
      const dup = canStrategyOpenPosition(
        ctx.state,
        op.symbol,
        op.exchange,
        op.strategyId,
        multi
      );
      if (!dup.allowed) {
        decisions.push({
          action: "SKIP",
          symbol: op.symbol,
          exchange: op.exchange,
          ownerStrategyId: op.strategyId,
          ownerStrategyName: op.strategyName,
          price: op.price,
          quantity: op.quantity,
          signalReason: op.reason,
          skipReason: dup.reason ?? "Duplicate exposure",
          exitReason: "DUPLICATE_EXPOSURE",
        });
        continue;
      }

      if (!multi && hasOpenPositionForSymbol(ctx.state, op.symbol, op.exchange)) {
        decisions.push({
          action: "SKIP",
          symbol: op.symbol,
          exchange: op.exchange,
          ownerStrategyId: op.strategyId,
          ownerStrategyName: op.strategyName,
          price: op.price,
          quantity: op.quantity,
          signalReason: op.reason,
          skipReason: "Symbol already has open position",
          exitReason: "DUPLICATE_EXPOSURE",
        });
        continue;
      }

      const orderValue = op.quantity * op.price;
      if (orderValue > remainingBalance) {
        decisions.push({
          action: "SKIP",
          symbol: op.symbol,
          exchange: op.exchange,
          ownerStrategyId: op.strategyId,
          ownerStrategyName: op.strategyName,
          price: op.price,
          quantity: op.quantity,
          signalReason: op.reason,
          skipReason: "Insufficient capital",
        });
        continue;
      }

      if (orderValue > maxOrder) {
        decisions.push({
          action: "SKIP",
          symbol: op.symbol,
          exchange: op.exchange,
          ownerStrategyId: op.strategyId,
          ownerStrategyName: op.strategyName,
          price: op.price,
          quantity: op.quantity,
          signalReason: op.reason,
          skipReason: `Exceeds max order value (${maxOrder})`,
        });
        continue;
      }

      if (
        (ctx.settings.maxDailyLoss ?? 0) > 0 &&
        (ctx.todayRealizedLoss ?? 0) >= (ctx.settings.maxDailyLoss ?? 0)
      ) {
        decisions.push({
          action: "SKIP",
          symbol: op.symbol,
          exchange: op.exchange,
          ownerStrategyId: op.strategyId,
          ownerStrategyName: op.strategyName,
          price: op.price,
          quantity: op.quantity,
          signalReason: op.reason,
          skipReason: "Daily risk limit reached",
        });
        continue;
      }

      decisions.push({
        action: "BUY",
        symbol: op.symbol,
        exchange: op.exchange,
        ownerStrategyId: op.strategyId,
        ownerStrategyName: op.strategyName,
        price: op.price,
        quantity: op.quantity,
        signalReason: op.reason,
        buySignalCount: op.buySignalCount,
      });
      remainingBalance -= orderValue;
      continue;
    }

    if (op.action === "SELL") {
      const exitCheck = canStrategyExitPosition(
        ctx.state,
        op.symbol,
        op.exchange,
        op.strategyId
      );
      if (!exitCheck.allowed || !exitCheck.position) {
        decisions.push({
          action: "SKIP",
          symbol: op.symbol,
          exchange: op.exchange,
          ownerStrategyId: op.strategyId,
          ownerStrategyName: op.strategyName,
          price: op.price,
          quantity: op.quantity,
          signalReason: op.reason,
          skipReason: exitCheck.reason ?? "Exit not allowed",
        });
        continue;
      }

      decisions.push({
        action: "SELL",
        symbol: op.symbol,
        exchange: op.exchange,
        ownerStrategyId: op.strategyId,
        ownerStrategyName: op.strategyName,
        price: op.price,
        quantity: Math.min(op.quantity, exitCheck.position.quantity),
        signalReason: op.reason,
        exitReason: "OWNER_STRATEGY_EXIT",
        positionId: exitCheck.position.id,
      });
    }
  }

  return { decisions, conflicts };
}
