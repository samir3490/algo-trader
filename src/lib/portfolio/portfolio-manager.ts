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
  getOpenPositions,
  hasOpenPositionForSymbol,
} from "./position-manager";
import type {
  PortfolioDecision,
  StrategyConflict,
  StrategyOpinion,
} from "./types";
import { resolvePaperOrderQty, resolvePaperScanOrderQty } from "./paper-position-size";
import {
  effectivePaperMaxOrderValue,
} from "./buy-selection";
import { effectivePaperMinOrderValue } from "./paper-position-size";
import {
  meetsStrategySellProfitTarget,
} from "@/lib/risk/paper-risk-guard";
import { formatSellStrength } from "@/lib/paper-trading/balance";

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
      ? resolvePaperScanOrderQty(sig.price, settings, {
          strategyParams: strat.params,
          balance,
          atr: sig.atr,
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
    scanConfidence: sig.confidence,
  };
}

/**
 * Portfolio-level decision layer: strategies advise, PortfolioManager decides.
 */
function consolidateBuyOpinions(opinions: StrategyOpinion[]): StrategyOpinion[] {
  const buyCounts = new Map<string, number>();
  const buyStrategyNames = new Map<string, string[]>();
  const confidenceSums = new Map<string, number>();
  const bestBuy = new Map<string, StrategyOpinion>();

  for (const op of opinions) {
    if (op.action !== "BUY") continue;
    const key = symKey(op.symbol, op.exchange);
    buyCounts.set(key, (buyCounts.get(key) ?? 0) + 1);
    confidenceSums.set(key, (confidenceSums.get(key) ?? 0) + (op.confidence ?? 0));
    const names = buyStrategyNames.get(key) ?? [];
    if (!names.includes(op.strategyName)) names.push(op.strategyName);
    buyStrategyNames.set(key, names);
    const existing = bestBuy.get(key);
    if (!existing || op.confidence > existing.confidence) {
      bestBuy.set(key, op);
    }
  }

  return [...bestBuy.values()].map((op) => {
    const key = symKey(op.symbol, op.exchange);
    const confidenceSum = confidenceSums.get(key) ?? op.confidence;
    return {
      ...op,
      buySignalCount: buyCounts.get(key) ?? 1,
      signalStrategyNames: buyStrategyNames.get(key) ?? [op.strategyName],
      confidenceSum,
      scanConfidence: confidenceSum,
    };
  });
}

/** Paper auto-trade: entries from BUY signals only; exits via stop-loss / take-profit. */
export function buyOnlyOpinions(opinions: StrategyOpinion[]): StrategyOpinion[] {
  return opinions.filter((o) => o.action === "BUY");
}

export function sellOnlyOpinions(opinions: StrategyOpinion[]): StrategyOpinion[] {
  return opinions.filter((o) => o.action === "SELL");
}

function consolidateSellOpinions(opinions: StrategyOpinion[]): StrategyOpinion[] {
  const sellCounts = new Map<string, number>();
  const sellStrategyNames = new Map<string, string[]>();
  const confidenceSums = new Map<string, number>();
  const bestSell = new Map<string, StrategyOpinion>();

  for (const op of opinions) {
    if (op.action !== "SELL") continue;
    const key = symKey(op.symbol, op.exchange);
    sellCounts.set(key, (sellCounts.get(key) ?? 0) + 1);
    confidenceSums.set(key, (confidenceSums.get(key) ?? 0) + (op.confidence ?? 0));
    const names = sellStrategyNames.get(key) ?? [];
    if (!names.includes(op.strategyName)) names.push(op.strategyName);
    sellStrategyNames.set(key, names);
    const existing = bestSell.get(key);
    if (!existing || op.confidence > existing.confidence) {
      bestSell.set(key, op);
    }
  }

  return [...bestSell.values()].map((op) => {
    const key = symKey(op.symbol, op.exchange);
    const confidenceSum = confidenceSums.get(key) ?? op.confidence;
    return {
      ...op,
      sellSignalCount: sellCounts.get(key) ?? 1,
      signalStrategyNames: sellStrategyNames.get(key) ?? [op.strategyName],
      confidenceSum,
      scanConfidence: confidenceSum,
    };
  });
}

export function rankSellOpinions(opinions: StrategyOpinion[]): StrategyOpinion[] {
  return consolidateSellOpinions(sellOnlyOpinions(opinions)).sort((a, b) => {
    const strength = (b.sellSignalCount ?? 0) - (a.sellSignalCount ?? 0);
    if (strength !== 0) return strength;
    const conf =
      (b.confidenceSum ?? b.confidence ?? 0) - (a.confidenceSum ?? a.confidence ?? 0);
    if (conf !== 0) return conf;
    return a.symbol.localeCompare(b.symbol, "en", { sensitivity: "base" });
  });
}

function buyActiveSymbolKeys(opinions: StrategyOpinion[]): Set<string> {
  const keys = new Set<string>();
  for (const op of opinions) {
    if (op.action === "BUY") keys.add(symKey(op.symbol, op.exchange));
  }
  return keys;
}

export interface PaperSellQueueOptions {
  boughtThisScan?: Set<string>;
  minHoldMinutes?: number;
}

/** Ranked paper SELL queue — held symbols at/above take-profit %, consolidated sell weight. */
export function buildRankedPaperSellQueue(
  opinions: StrategyOpinion[],
  ctx: PortfolioContext,
  options?: PaperSellQueueOptions
): PortfolioDecision[] {
  const minHold =
    options?.minHoldMinutes ?? ctx.settings.minHoldMinutesBeforeSell ?? 60;
  const now = Date.now();
  const buyActive = buyActiveSymbolKeys(opinions);
  const decisions: PortfolioDecision[] = [];

  for (const op of rankSellOpinions(opinions)) {
    const key = symKey(op.symbol, op.exchange);
    if (!hasOpenPositionForSymbol(ctx.state, op.symbol, op.exchange)) continue;
    if (buyActive.has(key)) continue;
    if (options?.boughtThisScan?.has(key)) continue;

    const openPositions = getOpenPositions(ctx.state, {
      symbol: op.symbol,
      exchange: op.exchange,
    });
    const position = openPositions[0];
    if (!position) continue;

    if (!meetsStrategySellProfitTarget(position, ctx.settings)) continue;

    const minSellSignals = ctx.settings.strategySellMinSignals ?? 2;
    if ((op.sellSignalCount ?? 1) < minSellSignals) continue;

    let anchorMs = 0;
    for (const p of openPositions) {
      const ms = Date.parse(p.entryTime);
      if (!Number.isNaN(ms) && ms > anchorMs) anchorMs = ms;
    }
    if (anchorMs > 0 && now - anchorMs < minHold * 60 * 1000) continue;

    const exitCheck = canStrategyExitPosition(
      ctx.state,
      op.symbol,
      op.exchange,
      position.ownerStrategyId
    );
    if (!exitCheck.allowed || !exitCheck.position) continue;

    const sellCount = op.sellSignalCount ?? 1;
    const strengthLabel = formatSellStrength(sellCount);

    decisions.push({
      action: "SELL",
      symbol: op.symbol,
      exchange: op.exchange,
      ownerStrategyId: exitCheck.position.ownerStrategyId,
      ownerStrategyName:
        exitCheck.position.ownerStrategyName ?? op.strategyName,
      price: op.price,
      quantity: Math.min(op.quantity, exitCheck.position.quantity),
      signalReason: `${op.reason} · ${strengthLabel}`,
      exitReason: "OWNER_STRATEGY_EXIT",
      positionId: exitCheck.position.id,
      sellSignalCount: sellCount,
      signalStrategyNames: op.signalStrategyNames,
      scanConfidence: op.confidenceSum ?? op.confidence,
      confidenceSum: op.confidenceSum,
    });
  }

  return decisions;
}

export function rankBuyOpinions(opinions: StrategyOpinion[]): StrategyOpinion[] {
  return consolidateBuyOpinions(buyOnlyOpinions(opinions)).sort((a, b) => {
    const strength = (b.buySignalCount ?? 0) - (a.buySignalCount ?? 0);
    if (strength !== 0) return strength;
    const conf =
      (b.confidenceSum ?? b.confidence ?? 0) - (a.confidenceSum ?? a.confidence ?? 0);
    if (conf !== 0) return conf;
    return a.symbol.localeCompare(b.symbol, "en", { sensitivity: "base" });
  });
}

/** Ranked paper BUY queue — matches display list; skips symbols already held. */
export function buildRankedPaperBuyQueue(
  opinions: StrategyOpinion[],
  ctx: PortfolioContext
): PortfolioDecision[] {
  return rankBuyOpinions(opinions)
    .filter((op) => !hasOpenPositionForSymbol(ctx.state, op.symbol, op.exchange))
    .map((op) => ({
      action: "BUY" as const,
      symbol: op.symbol,
      exchange: op.exchange,
      ownerStrategyId: op.strategyId,
      ownerStrategyName: op.strategyName,
      price: op.price,
      quantity: op.quantity,
      signalReason: op.reason,
      buySignalCount: op.buySignalCount,
      signalStrategyNames: op.signalStrategyNames,
      scanConfidence: op.confidenceSum ?? op.confidence,
    }));
}

/** @deprecated Use buildRankedPaperBuyQueue */
export function buildBuyDecisionsFromOpinions(
  opinions: StrategyOpinion[],
  ctx: PortfolioContext
): PortfolioDecision[] {
  return buildRankedPaperBuyQueue(opinions, ctx);
}

export function evaluatePortfolioDecisions(
  opinions: StrategyOpinion[],
  ctx: PortfolioContext
): {
  decisions: PortfolioDecision[];
  conflicts: StrategyConflict[];
} {
  const mergedOpinions = rankBuyOpinions(opinions);
  const conflicts = detectStrategyConflicts(mergedOpinions);
  const blocked = opinionsBlockedByConflict(mergedOpinions, conflicts, (symbol, exchange) =>
    hasOpenPositionForSymbol(ctx.state, symbol, exchange)
  );
  const decisions: PortfolioDecision[] = [];
  const multi = ctx.multiStrategyMode === true;

  const maxOrder = effectivePaperMaxOrderValue(ctx.settings);
  const minOrder = effectivePaperMinOrderValue(ctx.settings);

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
      if (orderValue > (ctx.state.balance ?? 0)) {
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
          skipReason: `Exceeds paper max per trade (₹${maxOrder})`,
        });
        continue;
      }

      if (minOrder > 0 && orderValue < minOrder) {
        decisions.push({
          action: "SKIP",
          symbol: op.symbol,
          exchange: op.exchange,
          ownerStrategyId: op.strategyId,
          ownerStrategyName: op.strategyName,
          price: op.price,
          quantity: op.quantity,
          signalReason: op.reason,
          skipReason: `Below paper min purchase (₹${minOrder})`,
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
        signalStrategyNames: op.signalStrategyNames,
        scanConfidence: op.confidenceSum ?? op.confidence,
        confidenceSum: op.confidenceSum,
      });
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
