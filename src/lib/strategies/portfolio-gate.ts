import type { AppSettings, PaperHolding, PaperTrade } from "@/lib/firebase";
import { tradeExecutedAtMs } from "@/lib/paper-trades/normalize";
import {
  canStrategyExitPosition,
  getOpenPositions,
} from "@/lib/portfolio/position-manager";
import { OWNER_MANUAL } from "@/lib/portfolio/types";
import type { PaperPosition } from "@/lib/portfolio/types";

function symKey(symbol: string, exchange: string): string {
  return `${symbol.trim().toUpperCase()}:${(exchange || "NSE").trim().toUpperCase()}`;
}

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function tradeOnToday(t: PaperTrade): boolean {
  const today = todayIST();
  return (
    t.date === today ||
    new Date(tradeExecutedAtMs(t)).toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    }) === today
  );
}

/** Count buy→sell round trips for a symbol today. */
function roundTripsToday(
  trades: PaperTrade[],
  symbol: string,
  exchange: string
): number {
  const key = symKey(symbol, exchange);
  const dayTrades = trades
    .filter((t) => symKey(t.symbol, t.exchange) === key && tradeOnToday(t))
    .sort((a, b) => tradeExecutedAtMs(a) - tradeExecutedAtMs(b));

  let trips = 0;
  let openBuy = false;
  for (const t of dayTrades) {
    if (t.side === "BUY") openBuy = true;
    if (t.side === "SELL" && openBuy) {
      trips += 1;
      openBuy = false;
    }
  }
  return trips;
}

function lastSellMs(trades: PaperTrade[], symbol: string, exchange: string): number {
  const key = symKey(symbol, exchange);
  let last = 0;
  for (const t of trades) {
    if (t.side !== "SELL" || symKey(t.symbol, t.exchange) !== key) continue;
    const ms = tradeExecutedAtMs(t);
    if (ms > last) last = ms;
  }
  return last;
}

function lastBuyMs(trades: PaperTrade[], symbol: string, exchange: string): number {
  const key = symKey(symbol, exchange);
  let last = 0;
  for (const t of trades) {
    if (t.side !== "BUY" || symKey(t.symbol, t.exchange) !== key) continue;
    const ms = tradeExecutedAtMs(t);
    if (ms > last) last = ms;
  }
  return last;
}

/** Latest entry time for open positions on a symbol, or last buy trade — used for min-hold gate. */
export function positionHoldAnchorMs(
  openPositions: PaperPosition[],
  trades: PaperTrade[],
  symbol: string,
  exchange: string
): number {
  let anchor = 0;
  for (const p of openPositions) {
    const ms = Date.parse(p.entryTime);
    if (!Number.isNaN(ms) && ms > anchor) anchor = ms;
  }
  const lastBuy = lastBuyMs(trades, symbol, exchange);
  return Math.max(anchor, lastBuy);
}

function anySellToday(
  trades: PaperTrade[],
  symbol: string,
  exchange: string
): boolean {
  const key = symKey(symbol, exchange);
  return trades.some(
    (t) =>
      t.side === "SELL" &&
      symKey(t.symbol, t.exchange) === key &&
      tradeOnToday(t)
  );
}

function anyBuyToday(
  trades: PaperTrade[],
  symbol: string,
  exchange: string
): boolean {
  const key = symKey(symbol, exchange);
  return trades.some(
    (t) =>
      t.side === "BUY" &&
      symKey(t.symbol, t.exchange) === key &&
      tradeOnToday(t)
  );
}

function lastSellToday(
  trades: PaperTrade[],
  symbol: string,
  exchange: string
): PaperTrade | undefined {
  const key = symKey(symbol, exchange);
  return [...trades]
    .filter(
      (t) =>
        t.side === "SELL" &&
        symKey(t.symbol, t.exchange) === key &&
        tradeOnToday(t)
    )
    .sort((a, b) => tradeExecutedAtMs(b) - tradeExecutedAtMs(a))[0];
}

/** Infer whether the latest sell today was a loss (works before brokerage netPnl existed). */
function lastSellTodayWasLoss(
  trades: PaperTrade[],
  symbol: string,
  exchange: string
): boolean {
  const sell = lastSellToday(trades, symbol, exchange);
  if (!sell) return false;
  if (sell.netPnl != null) return sell.netPnl < 0;

  const key = symKey(symbol, exchange);
  const buysBefore = trades
    .filter(
      (t) =>
        t.side === "BUY" &&
        symKey(t.symbol, t.exchange) === key &&
        tradeExecutedAtMs(t) <= tradeExecutedAtMs(sell)
    )
    .sort((a, b) => tradeExecutedAtMs(b) - tradeExecutedAtMs(a));
  const buy = buysBefore[0];
  if (!buy) return false;
  return sell.price < buy.price;
}

export interface PortfolioGateContext {
  holdings: PaperHolding[];
  positions?: PaperPosition[];
  trades: PaperTrade[];
  settings: AppSettings;
  /** Strategy requesting the trade — required for owner exit checks. */
  ownerStrategyId?: string;
  multiStrategyMode?: boolean;
  /** Symbols sold in this cron run — block immediate rebuy. */
  soldThisRun: Set<string>;
  /** Symbols bought in this cron run — block strategy sell until next scan. */
  boughtThisRun?: Set<string>;
  /** Symbol → cooldown end (ms). */
  symbolCooldownUntil?: Record<string, number>;
  /** Symbol locked for rest of IST day (persisted in strategyRunner). */
  symbolsLockedToday?: Record<string, string>;
}

export function lockSymbolForToday(
  locks: Record<string, string>,
  symbol: string,
  exchange: string
): Record<string, string> {
  const key = symKey(symbol, exchange);
  return { ...locks, [key]: todayIST() };
}

export function pruneSymbolLocksForToday(
  locks: Record<string, string> | undefined
): Record<string, string> {
  const today = todayIST();
  const out: Record<string, string> = {};
  for (const [k, d] of Object.entries(locks ?? {})) {
    if (d === today) out[k] = d;
  }
  return out;
}

export function canExecuteStrategyTrade(
  action: "BUY" | "SELL",
  symbol: string,
  exchange: string,
  ctx: PortfolioGateContext
): { allowed: boolean; reason?: string } {
  const key = symKey(symbol, exchange);
  const stateLike = {
    balance: 0,
    holdings: ctx.holdings,
    positions: ctx.positions,
    trades: ctx.trades,
  };
  const openPositions = getOpenPositions(stateLike, { symbol, exchange });
  const holding = ctx.holdings.find((h) => symKey(h.symbol, h.exchange) === key);
  const hasPosition =
    openPositions.length > 0 || (holding?.qty ?? 0) > 0;
  const ownerId = ctx.ownerStrategyId;

  if (action === "SELL") {
    if (!hasPosition) {
      return { allowed: false, reason: "No position to sell" };
    }
    if (ctx.boughtThisRun?.has(key)) {
      return {
        allowed: false,
        reason: "Bought this scan — strategy sell deferred",
      };
    }
    if (ownerId && openPositions.length > 0) {
      const exitCheck = canStrategyExitPosition(
        stateLike,
        symbol,
        exchange,
        ownerId
      );
      if (!exitCheck.allowed) {
        return { allowed: false, reason: exitCheck.reason };
      }
    }
    const minHold = ctx.settings.minHoldMinutesBeforeSell ?? 60;
    const manualExit = ownerId === OWNER_MANUAL;
    const holdAnchor = positionHoldAnchorMs(
      openPositions,
      ctx.trades,
      symbol,
      exchange
    );
    if (
      !manualExit &&
      holdAnchor > 0 &&
      Date.now() - holdAnchor < minHold * 60 * 1000
    ) {
      return {
        allowed: false,
        reason: `Min hold ${minHold}m before strategy sell`,
      };
    }
    return { allowed: true };
  }

  // Same-scan only: avoid instant rebuy after a sell in this run.
  if (ctx.soldThisRun.has(key)) {
    return { allowed: false, reason: "Sold this scan — no immediate rebuy" };
  }

  // Hard buy block: already holding the symbol (no add-on), including
  // holdings-only rows when positions failed to migrate.
  if (hasPosition) {
    return { allowed: false, reason: "Already holding — no add-on buy" };
  }

  const noSameDayRebuy = ctx.settings.noSameDayRebuyAfterSell === true;
  const cooldownMinutes = ctx.settings.rebuyCooldownMinutes ?? 0;
  const maxTrips = ctx.settings.maxRoundTripsPerSymbolPerDay ?? 0;

  if (noSameDayRebuy) {
    if (ctx.symbolsLockedToday?.[key] === todayIST()) {
      return { allowed: false, reason: "Symbol locked for today after sell" };
    }
    if (anyBuyToday(ctx.trades, symbol, exchange)) {
      return {
        allowed: false,
        reason: "Already bought this symbol today — no duplicate entry",
      };
    }
    if (anySellToday(ctx.trades, symbol, exchange)) {
      return { allowed: false, reason: "Sold today — no rebuy until tomorrow" };
    }
    if (lastSellTodayWasLoss(ctx.trades, symbol, exchange)) {
      return {
        allowed: false,
        reason: "Last sell today was at a loss — no rebuy today",
      };
    }
  }

  if (cooldownMinutes > 0) {
    const cooldownEnd = ctx.symbolCooldownUntil?.[key];
    if (cooldownEnd && Date.now() < cooldownEnd) {
      return { allowed: false, reason: "Cooldown after recent sell" };
    }
    const lastSell = lastSellMs(ctx.trades, symbol, exchange);
    const cooldownMs = cooldownMinutes * 60 * 1000;
    if (lastSell > 0 && Date.now() - lastSell < cooldownMs) {
      return { allowed: false, reason: "Rebuy cooldown after sell" };
    }
  }

  if (maxTrips > 0 && roundTripsToday(ctx.trades, symbol, exchange) >= maxTrips) {
    return {
      allowed: false,
      reason: `Max ${maxTrips} round-trip(s) per symbol today`,
    };
  }

  return { allowed: true };
}

/** Drop BUY signals for symbols already held (lossy positions should exit via risk guard). */
export function filterSignalsByHoldings<T extends { symbol: string; action: string }>(
  signals: T[],
  holdings: PaperHolding[]
): T[] {
  return signals.filter((sig) => {
    if (sig.action !== "BUY") return true;
    const h = holdings.find(
      (x) => x.symbol.toUpperCase() === sig.symbol.toUpperCase() && (x.qty ?? 0) > 0
    );
    return !h;
  });
}
