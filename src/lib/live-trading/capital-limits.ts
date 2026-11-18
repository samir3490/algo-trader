/** Defaults for live algo capital controls. */
export const DEFAULT_LIVE_ORDER_NOTIONAL = 5_000;
export const DEFAULT_LIVE_CAPITAL_LIMIT = 50_000;

export interface LiveCapitalSettings {
  /** Max ₹ notional for a single live BUY. */
  liveOrderNotional?: number;
  /** Max ₹ total deployed in live holdings/positions for algo buys. */
  liveCapitalLimit?: number;
  /** Legacy per-order cap (used if liveOrderNotional unset). */
  maxOrderValue?: number;
}

export interface LivePositionLike {
  qty: number;
  avgPrice?: number;
  average_price?: number;
}

export interface LiveHoldingLike {
  qty?: number;
  quantity?: number;
  avgPrice?: number;
  average_price?: number;
  invested?: number;
}

export function resolveLiveOrderNotional(settings: LiveCapitalSettings): number {
  const n = settings.liveOrderNotional ?? settings.maxOrderValue ?? DEFAULT_LIVE_ORDER_NOTIONAL;
  return Math.max(0, Number(n) || 0);
}

export function resolveLiveCapitalLimit(settings: LiveCapitalSettings): number {
  const n = settings.liveCapitalLimit ?? DEFAULT_LIVE_CAPITAL_LIMIT;
  return Math.max(0, Number(n) || 0);
}

/** Cost basis currently deployed in long live positions + delivery holdings. */
export function computeLiveDeployedCapital(
  positions: LivePositionLike[],
  holdings: LiveHoldingLike[]
): number {
  let sum = 0;
  for (const p of positions) {
    const qty = Number(p.qty) || 0;
    if (qty <= 0) continue;
    const avg = Number(p.avgPrice ?? p.average_price) || 0;
    sum += qty * avg;
  }
  for (const h of holdings) {
    if (typeof h.invested === "number" && Number.isFinite(h.invested)) {
      sum += Math.max(0, h.invested);
      continue;
    }
    const qty = Number(h.qty ?? h.quantity) || 0;
    if (qty <= 0) continue;
    const avg = Number(h.avgPrice ?? h.average_price) || 0;
    sum += qty * avg;
  }
  return Math.round(sum * 100) / 100;
}

export function liveOrderValue(qty: number, price: number): number {
  const q = Math.max(0, Math.floor(qty));
  const p = Math.max(0, price);
  return Math.round(q * p * 100) / 100;
}

/** Whole shares for a target ₹ notional at the given price. */
export function qtyForLiveNotional(notional: number, price: number): number {
  if (price <= 0 || notional <= 0) return 0;
  return Math.max(1, Math.floor(notional / price));
}

export interface LiveBuyLimitResult {
  ok: boolean;
  error?: string;
  orderValue: number;
  deployed: number;
  orderNotionalCap: number;
  capitalLimit: number;
  remainingCapital: number;
}

/**
 * Gate a live BUY against per-trade notional and total capital limit.
 * SELLs always pass (they free capital).
 */
export function evaluateLiveBuyLimits(input: {
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  settings: LiveCapitalSettings;
  positions: LivePositionLike[];
  holdings: LiveHoldingLike[];
}): LiveBuyLimitResult {
  const orderNotionalCap = resolveLiveOrderNotional(input.settings);
  const capitalLimit = resolveLiveCapitalLimit(input.settings);
  const deployed = computeLiveDeployedCapital(input.positions, input.holdings);
  const orderValue = liveOrderValue(input.qty, input.price);
  const remainingCapital = Math.max(0, capitalLimit - deployed);

  if (input.side !== "BUY") {
    return {
      ok: true,
      orderValue,
      deployed,
      orderNotionalCap,
      capitalLimit,
      remainingCapital,
    };
  }

  if (input.qty <= 0 || input.price <= 0) {
    return {
      ok: false,
      error: "Enter a valid quantity and price for the live order.",
      orderValue,
      deployed,
      orderNotionalCap,
      capitalLimit,
      remainingCapital,
    };
  }

  if (orderNotionalCap > 0 && orderValue > orderNotionalCap + 0.01) {
    return {
      ok: false,
      error: `Order value ₹${orderValue.toFixed(0)} exceeds per-trade limit ₹${orderNotionalCap.toFixed(0)}.`,
      orderValue,
      deployed,
      orderNotionalCap,
      capitalLimit,
      remainingCapital,
    };
  }

  if (capitalLimit > 0 && deployed + orderValue > capitalLimit + 0.01) {
    return {
      ok: false,
      error: `Live capital limit ₹${capitalLimit.toFixed(0)} reached (deployed ₹${deployed.toFixed(0)}, remaining ₹${remainingCapital.toFixed(0)}).`,
      orderValue,
      deployed,
      orderNotionalCap,
      capitalLimit,
      remainingCapital,
    };
  }

  return {
    ok: true,
    orderValue,
    deployed,
    orderNotionalCap,
    capitalLimit,
    remainingCapital,
  };
}
