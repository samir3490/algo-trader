import type { AppSettings, PaperHolding, PaperTrade } from "@/lib/firebase";
import { tradeExecutedAtMs } from "@/lib/paper-trades/normalize";

function symKey(symbol: string, exchange: string): string {
  return `${symbol.trim().toUpperCase()}:${(exchange || "NSE").trim().toUpperCase()}`;
}

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** Count buy→sell round trips for a symbol today. */
function roundTripsToday(
  trades: PaperTrade[],
  symbol: string,
  exchange: string
): number {
  const key = symKey(symbol, exchange);
  const today = todayIST();
  const dayTrades = trades
    .filter(
      (t) =>
        symKey(t.symbol, t.exchange) === key &&
        (t.date === today ||
          new Date(tradeExecutedAtMs(t)).toLocaleDateString("en-CA", {
            timeZone: "Asia/Kolkata",
          }) === today)
    )
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

export interface PortfolioGateContext {
  holdings: PaperHolding[];
  trades: PaperTrade[];
  settings: AppSettings;
  /** Symbols sold in this cron run — block immediate rebuy. */
  soldThisRun: Set<string>;
  /** Symbol → cooldown end (ms). */
  symbolCooldownUntil?: Record<string, number>;
}

export function canExecuteStrategyTrade(
  action: "BUY" | "SELL",
  symbol: string,
  exchange: string,
  ctx: PortfolioGateContext
): { allowed: boolean; reason?: string } {
  const key = symKey(symbol, exchange);
  const holding = ctx.holdings.find((h) => symKey(h.symbol, h.exchange) === key);
  const hasPosition = (holding?.qty ?? 0) > 0;

  if (action === "SELL") {
    if (!hasPosition) {
      return { allowed: false, reason: "No position to sell" };
    }
    return { allowed: true };
  }

  // BUY guards
  if (ctx.soldThisRun.has(key)) {
    return { allowed: false, reason: "Sold this scan — no immediate rebuy" };
  }

  if (hasPosition) {
    return { allowed: false, reason: "Already holding — no add-on buy" };
  }

  const today = todayIST();
  const lastSellTrade = [...ctx.trades]
    .filter(
      (t) =>
        t.side === "SELL" &&
        symKey(t.symbol, t.exchange) === key &&
        (t.date === today ||
          new Date(tradeExecutedAtMs(t)).toLocaleDateString("en-CA", {
            timeZone: "Asia/Kolkata",
          }) === today)
    )
    .sort((a, b) => tradeExecutedAtMs(b) - tradeExecutedAtMs(a))[0];

  if (lastSellTrade?.netPnl != null && lastSellTrade.netPnl < 0) {
    return { allowed: false, reason: "Last sell was at a loss — no same-day rebuy" };
  }

  const cooldownEnd = ctx.symbolCooldownUntil?.[key];
  if (cooldownEnd && Date.now() < cooldownEnd) {
    return { allowed: false, reason: "Cooldown after recent sell" };
  }

  const lastSell = lastSellMs(ctx.trades, symbol, exchange);
  const cooldownMs = (ctx.settings.rebuyCooldownMinutes ?? 240) * 60 * 1000;
  if (lastSell > 0 && Date.now() - lastSell < cooldownMs) {
    return { allowed: false, reason: "Rebuy cooldown after sell" };
  }

  const maxTrips = ctx.settings.maxRoundTripsPerSymbolPerDay ?? 1;
  if (roundTripsToday(ctx.trades, symbol, exchange) >= maxTrips) {
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
