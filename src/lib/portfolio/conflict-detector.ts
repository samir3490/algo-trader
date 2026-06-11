import type { StrategyOpinion, StrategyConflict } from "./types";

function symKey(symbol: string, exchange: string): string {
  return `${symbol.trim().toUpperCase()}:${(exchange || "NSE").trim().toUpperCase()}`;
}

/**
 * Detect opposing BUY/SELL from different strategies on the same symbol within one scan.
 * Logs CONFLICTING_STRATEGY_SIGNAL — does not auto-execute.
 */
export function detectStrategyConflicts(
  opinions: StrategyOpinion[],
  windowMs = 15 * 60 * 1000
): StrategyConflict[] {
  const bySymbol = new Map<string, StrategyOpinion[]>();
  for (const o of opinions) {
    if (o.action === "HOLD") continue;
    const key = symKey(o.symbol, o.exchange);
    const list = bySymbol.get(key) ?? [];
    list.push(o);
    bySymbol.set(key, list);
  }

  const conflicts: StrategyConflict[] = [];
  const now = new Date().toISOString();

  for (const [key, group] of bySymbol) {
    const [sym, ex] = key.split(":");
    const buys = group.filter((o) => o.action === "BUY");
    const sells = group.filter((o) => o.action === "SELL");

    if (buys.length === 0 || sells.length === 0) continue;

    const buyIds = [...new Set(buys.map((b) => b.strategyId))];
    const sellIds = [...new Set(sells.map((s) => s.strategyId))];

    const crossOwner =
      buyIds.some((bid) => !sellIds.includes(bid)) ||
      sellIds.some((sid) => !buyIds.includes(sid));

    if (!crossOwner && buyIds.length === 1 && sellIds.length === 1 && buyIds[0] === sellIds[0]) {
      continue;
    }

    conflicts.push({
      symbol: sym,
      exchange: ex,
      type: "CONFLICTING_STRATEGY_SIGNAL",
      buyStrategyIds: buyIds,
      sellStrategyIds: sellIds,
      message: `BUY from [${buyIds.join(", ")}] vs SELL from [${sellIds.join(", ")}] on ${sym} within ${windowMs / 60000}min window`,
      detectedAt: now,
    });
  }

  return conflicts;
}

/**
 * When flat on a symbol, opposing SELL signals cannot execute anyway — allow BUY.
 * When a position is open, block both sides to avoid wash trades.
 */
export function opinionsBlockedByConflict(
  opinions: StrategyOpinion[],
  conflicts: StrategyConflict[],
  hasOpenPosition?: (symbol: string, exchange: string) => boolean
): Set<string> {
  const blocked = new Set<string>();
  for (const c of conflicts) {
    const key = symKey(c.symbol, c.exchange);
    const hasPos = hasOpenPosition?.(c.symbol, c.exchange) ?? false;
    for (const o of opinions) {
      if (symKey(o.symbol, o.exchange) !== key || o.action === "HOLD") continue;
      if (!hasPos && o.action === "BUY") continue;
      blocked.add(`${o.strategyId}:${key}:${o.action}`);
    }
  }
  return blocked;
}
