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

/** Target rupee notional per paper BUY (default ₹1L). */
export function paperOrderNotional(settings: Pick<
  AppSettings,
  "paperOrderNotional" | "maxOrderValue"
>): number {
  return Math.max(
    1000,
    settings.paperOrderNotional ?? DEFAULT_PAPER_NOTIONAL
  );
}

/** Max rupees allowed per order (always at least paper notional after normalize). */
export function effectivePaperOrderCap(
  settings: Pick<AppSettings, "paperOrderNotional" | "maxOrderValue">
): number {
  const notional = paperOrderNotional(settings);
  return Math.max(settings.maxOrderValue ?? 0, notional);
}

/**
 * Whole-share qty for a rupee budget. Uses floor so order value ≤ budget;
 * returns 0 when even 1 share exceeds budget or price is invalid.
 */
export function integerShareQtyForBudget(
  price: number,
  budget: number,
  balance?: number
): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (!Number.isFinite(budget) || budget <= 0) return 0;

  let qty = Math.floor(budget / price);
  if (qty < 1) return 0;

  if (balance != null && Number.isFinite(balance) && balance > 0) {
    const affordable = Math.floor(balance / price);
    if (affordable < 1) return 0;
    qty = Math.min(qty, affordable);
  }

  return qty;
}

/**
 * Paper BUY size: target rupee notional per trade (default ₹1L), whole shares only.
 * Strategy card `quantity` overrides when explicitly set &gt; 1.
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
  const explicit = options?.strategyParams?.quantity;
  if (explicit != null && explicit > 0) {
    return Math.max(1, Math.floor(explicit));
  }

  const budget = Math.min(
    paperOrderNotional(settings),
    effectivePaperOrderCap(settings)
  );
  return integerShareQtyForBudget(price, budget, options?.balance);
}

/** Auto-scan sizing: use ₹ notional unless strategy sets quantity &gt; 1 explicitly. */
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
