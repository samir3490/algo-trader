import type { AppSettings } from "@/lib/firebase";
import {
  cashFlowForTrade,
  computeZerodhaCharges,
  type ZerodhaProduct,
} from "@/lib/brokerage/zerodha-charges";

const DEFAULT_PAPER_NOTIONAL = 100_000;

/** Cash required for a paper BUY (includes simulated charges when enabled). */
export function paperBuyCashRequired(
  qty: number,
  price: number,
  settings: Pick<
    AppSettings,
    "simulateBrokerage" | "paperDefaultProduct"
  >,
  product?: ZerodhaProduct
): number {
  const turnover = qty * price;
  if (!settings.simulateBrokerage) return turnover;
  const prod = (product ?? settings.paperDefaultProduct ?? "CNC") as ZerodhaProduct;
  const charges = computeZerodhaCharges({
    side: "BUY",
    qty,
    price,
    product: prod,
  });
  return cashFlowForTrade("BUY", turnover, charges);
}

export function paperOrderNotional(settings: Pick<
  AppSettings,
  "paperOrderNotional" | "maxOrderValue"
>): number {
  const notional = settings.paperOrderNotional ?? DEFAULT_PAPER_NOTIONAL;
  const cap = settings.maxOrderValue;
  if (cap > 0 && cap < notional) return cap;
  return notional;
}

/**
 * Paper BUY size: target rupee notional per trade (default ₹1L), not fixed share count.
 * Strategy card `quantity` overrides when explicitly set.
 */
export function resolvePaperOrderQty(
  price: number,
  settings: Pick<
    AppSettings,
    "paperOrderNotional" | "maxOrderValue" | "defaultQuantity"
  >,
  options?: {
    strategyParams?: Record<string, number>;
    balance?: number;
  }
): number {
  if (price <= 0) return 1;

  const explicit = options?.strategyParams?.quantity;
  if (explicit != null && explicit > 0) {
    return Math.max(1, Math.floor(explicit));
  }

  const budget = paperOrderNotional(settings);
  let qty = Math.max(1, Math.floor(budget / price));

  const balance = options?.balance;
  if (balance != null && balance > 0) {
    qty = Math.min(qty, Math.max(1, Math.floor(balance / price)));
  }

  return qty;
}

/** Auto-scan sizing: use ₹ notional unless strategy sets quantity > 1 explicitly. */
export function resolvePaperScanOrderQty(
  price: number,
  settings: Pick<
    AppSettings,
    "paperOrderNotional" | "maxOrderValue" | "defaultQuantity"
  >,
  options?: {
    strategyParams?: Record<string, number>;
    balance?: number;
  }
): number {
  const explicit = options?.strategyParams?.quantity;
  const useExplicit = explicit != null && explicit > 1;
  return resolvePaperOrderQty(price, settings, {
    strategyParams: useExplicit ? options?.strategyParams : undefined,
    balance: options?.balance,
  });
}
