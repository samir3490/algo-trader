import type { AppSettings } from "@/lib/firebase";
import {
  cashFlowForTrade,
  computeZerodhaCharges,
  type ZerodhaProduct,
} from "@/lib/brokerage/zerodha-charges";

const DEFAULT_PAPER_NOTIONAL = 100_000;
export const DEFAULT_PAPER_MAX_ORDER_VALUE = 500_000;
export const DEFAULT_PAPER_MIN_ORDER_VALUE = 25_000;

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
  "paperOrderNotional"
>): number {
  return Math.max(
    1000,
    settings.paperOrderNotional ?? DEFAULT_PAPER_NOTIONAL
  );
}

/** Hard rupee cap per paper BUY. */
export function effectivePaperOrderCap(
  settings: Pick<AppSettings, "paperMaxOrderValue">
): number {
  const cap = settings.paperMaxOrderValue ?? DEFAULT_PAPER_MAX_ORDER_VALUE;
  return cap > 0 ? cap : DEFAULT_PAPER_MAX_ORDER_VALUE;
}

/** Minimum rupee turnover per paper BUY (default ₹25,000). Set 0 to disable. */
export function effectivePaperMinOrderValue(
  settings: Pick<AppSettings, "paperMinOrderValue">
): number {
  const min = settings.paperMinOrderValue ?? DEFAULT_PAPER_MIN_ORDER_VALUE;
  return min > 0 ? min : 0;
}

/**
 * Step 1 — per-trade ceiling: min(max per trade, available balance).
 * All sizing modes work within this rupee budget.
 */
export function resolvePaperSpendCeiling(
  settings: Pick<AppSettings, "paperMaxOrderValue">,
  balance?: number
): number {
  const cap = effectivePaperOrderCap(settings);
  if (balance != null && Number.isFinite(balance) && balance > 0) {
    return Math.min(cap, balance);
  }
  return cap;
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
  | "paperMaxOrderValue"
  | "paperMinOrderValue"
  | "defaultQuantity"
  | "positionSizingMode"
  | "positionPct"
  | "atrRiskPct"
  | "atrPeriod"
>;

/**
 * Step 2 — rupee budget within the ceiling for notional / % modes.
 * ATR mode uses {@link resolveAtrRiskQty} instead (qty from volatility, still ≤ ceiling).
 */
export function resolvePaperSizingBudget(
  settings: PaperSizingSettings,
  options?: { balance?: number; atr?: number | null }
): number {
  const ceiling = resolvePaperSpendCeiling(settings, options?.balance);
  const mode = settings.positionSizingMode ?? "notional";
  const balance = options?.balance;

  if (mode === "portfolio_pct" && balance != null && balance > 0) {
    const pct = Math.max(0.1, settings.positionPct ?? 10);
    return Math.min(ceiling, balance * (pct / 100));
  }

  if (mode === "atr_risk") {
    // Fallback when ATR unavailable — use fixed notional within ceiling.
    return Math.min(paperOrderNotional(settings), ceiling);
  }

  return Math.min(paperOrderNotional(settings), ceiling);
}

/**
 * ATR sizing within ceiling: risk budget = min(ceiling, balance × risk%),
 * qty = floor(riskBudget / ATR), then clamp position value to ceiling.
 */
function resolveAtrRiskQty(
  price: number,
  settings: PaperSizingSettings,
  ceiling: number,
  balance: number,
  atr: number
): number {
  if (!Number.isFinite(atr) || atr <= 0) return 0;

  const riskPct = Math.max(0.1, settings.atrRiskPct ?? 1);
  const riskBudget = Math.min(ceiling, balance * (riskPct / 100));

  let qty = Math.floor(riskBudget / atr);
  if (qty < 1) return 0;

  const maxQtyByCeiling = Math.floor(ceiling / price);
  if (maxQtyByCeiling < 1) return 0;
  qty = Math.min(qty, maxQtyByCeiling);

  const maxQtyByBalance = Math.floor(balance / price);
  if (maxQtyByBalance < 1) return 0;
  qty = Math.min(qty, maxQtyByBalance);

  return qty;
}

function qtyWithinCeiling(
  qty: number,
  price: number,
  ceiling: number,
  balance?: number
): number {
  if (qty < 1) return 0;
  const maxByCeiling = Math.floor(ceiling / price);
  if (maxByCeiling < 1) return 0;
  let capped = Math.min(qty, maxByCeiling);
  if (balance != null && balance > 0) {
    const maxByBalance = Math.floor(balance / price);
    if (maxByBalance < 1) return 0;
    capped = Math.min(capped, maxByBalance);
  }
  return capped >= 1 ? capped : 0;
}

/**
 * Step 3 — enforce minimum purchase: bump qty up to meet min turnover if possible
 * within ceiling and balance; otherwise skip (0).
 */
export function applyMinPaperPurchaseQty(
  qty: number,
  price: number,
  settings: Pick<AppSettings, "paperMinOrderValue">,
  ceiling: number,
  balance?: number
): number {
  if (qty < 1) return 0;

  const minValue = effectivePaperMinOrderValue(settings);
  if (minValue <= 0) return qty;
  if (minValue > ceiling) return 0;

  const turnover = qty * price;
  if (turnover >= minValue) return qty;

  const minQty = Math.ceil(minValue / price);
  return qtyWithinCeiling(minQty, price, ceiling, balance);
}

function finalizePaperBuyQty(
  qty: number,
  price: number,
  settings: PaperSizingSettings,
  ceiling: number,
  balance?: number
): number {
  return applyMinPaperPurchaseQty(
    qtyWithinCeiling(qty, price, ceiling, balance),
    price,
    settings,
    ceiling,
    balance
  );
}

/**
 * Paper BUY size: cap first, then notional / % / ATR within that ceiling.
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
  const balance = options?.balance;
  const ceiling = resolvePaperSpendCeiling(settings, balance);

  const explicit = options?.strategyParams?.quantity;
  if (explicit != null && explicit > 0) {
    return finalizePaperBuyQty(
      Math.max(1, Math.floor(explicit)),
      price,
      settings,
      ceiling,
      balance
    );
  }

  const mode = settings.positionSizingMode ?? "notional";
  const atr = options?.atr;

  let qty = 0;
  if (
    mode === "atr_risk" &&
    atr != null &&
    atr > 0 &&
    balance != null &&
    balance > 0
  ) {
    qty = resolveAtrRiskQty(price, settings, ceiling, balance, atr);
  } else {
    const budget = resolvePaperSizingBudget(settings, { balance, atr });
    qty = integerShareQtyForBudget(price, budget, balance);
  }

  return finalizePaperBuyQty(qty, price, settings, ceiling, balance);
}

/** Auto-scan sizing: use sizing mode unless strategy sets quantity &gt; 1 explicitly. */
export function resolvePaperScanOrderQty(
  price: number,
  settings: Pick<
    AppSettings,
    | "paperOrderNotional"
    | "paperMaxOrderValue"
    | "paperMinOrderValue"
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

  const ceiling = resolvePaperSpendCeiling(settings, balance);
  qty = qtyWithinCeiling(qty, price, ceiling, balance);
  qty = applyMinPaperPurchaseQty(qty, price, settings, ceiling, balance);

  return qty >= 1 ? qty : 0;
}
