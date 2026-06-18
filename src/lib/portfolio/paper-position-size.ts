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

export type PaperSizingSettings = Pick<
  AppSettings,
  | "paperOrderNotional"
  | "maxOrderValue"
  | "defaultQuantity"
  | "positionSizingMode"
  | "positionPct"
  | "atrRiskPct"
  | "atrPeriod"
>;

/** Rupee budget for one paper BUY based on sizing mode. */
export function resolvePaperSizingBudget(
  settings: PaperSizingSettings,
  options?: { balance?: number; atr?: number | null }
): number {
  const cap = effectivePaperOrderCap(settings);
  const mode = settings.positionSizingMode ?? "notional";
  const balance = options?.balance;

  if (mode === "portfolio_pct" && balance != null && balance > 0) {
    const pct = Math.max(0.1, settings.positionPct ?? 10);
    return Math.min(cap, balance * (pct / 100));
  }

  if (mode === "atr_risk" && balance != null && balance > 0) {
    const atr = options?.atr;
    const riskPct = Math.max(0.1, settings.atrRiskPct ?? 1);
    if (atr != null && atr > 0) {
      const riskAmount = balance * (riskPct / 100);
      return Math.min(cap, riskAmount);
    }
  }

  return Math.min(paperOrderNotional(settings), cap);
}

/**
 * Paper BUY size: notional, portfolio %, or ATR-risk budget; whole shares only.
 * Strategy card `quantity` overrides when explicitly set &gt; 1.
 */
export function resolvePaperOrderQty(
  price: number,
  settings: PaperSizingSettings,
  options?: {
    strategyParams?: Record<string, number>;
    balance?: number;
    atr?: number | null;
  }
): number {
  const explicit = options?.strategyParams?.quantity;
  if (explicit != null && explicit > 0) {
    return Math.max(1, Math.floor(explicit));
  }

  const mode = settings.positionSizingMode ?? "notional";

  if (mode === "atr_risk") {
    const atr = options?.atr;
    const balance = options?.balance;
    if (atr != null && atr > 0 && balance != null && balance > 0) {
      const riskPct = Math.max(0.1, settings.atrRiskPct ?? 1);
      const riskAmount = Math.min(
        effectivePaperOrderCap(settings),
        balance * (riskPct / 100)
      );
      const qty = Math.floor(riskAmount / atr);
      if (qty >= 1) {
        return integerShareQtyForBudget(price, qty * price, balance) || qty;
      }
    }
  }

  const budget = resolvePaperSizingBudget(settings, {
    balance: options?.balance,
    atr: options?.atr,
  });
  return integerShareQtyForBudget(price, budget, options?.balance);
}

/** Auto-scan sizing: use sizing mode unless strategy sets quantity &gt; 1 explicitly. */
export function resolvePaperScanOrderQty(
  price: number,
  settings: Pick<
    AppSettings,
    | "paperOrderNotional"
    | "maxOrderValue"
    | "defaultQuantity"
    | "simulateBrokerage"
    | "paperDefaultProduct"
    | "positionSizingMode"
    | "positionPct"
    | "atrRiskPct"
    | "atrPeriod"
  >,
  options?: {
    strategyParams?: Record<string, number>;
    balance?: number;
    atr?: number | null;
  }
): number {
  const explicit = options?.strategyParams?.quantity;
  const useExplicit = explicit != null && explicit > 1;
  let qty = resolvePaperOrderQty(price, settings, {
    strategyParams: useExplicit ? options?.strategyParams : undefined,
    balance: options?.balance,
    atr: options?.atr,
  });
  if (qty < 1) return 0;

  const balance = options?.balance;
  if (balance != null && settings.simulateBrokerage) {
    while (
      qty >= 1 &&
      paperBuyCashRequired(qty, price, settings) > balance
    ) {
      qty -= 1;
    }
  } else if (balance != null && balance > 0) {
    while (qty >= 1 && qty * price > balance) {
      qty -= 1;
    }
  }

  return qty >= 1 ? qty : 0;
}
