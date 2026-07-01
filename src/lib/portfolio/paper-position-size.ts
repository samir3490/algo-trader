import type { AppSettings } from "@/lib/firebase";
import {
  cashFlowForTrade,
  computeZerodhaCharges,
  type ZerodhaProduct,
} from "@/lib/brokerage/zerodha-charges";

const DEFAULT_PAPER_NOTIONAL = 100_000;
export const DEFAULT_PAPER_MAX_ORDER_VALUE = 500_000;
export const DEFAULT_PAPER_MIN_ORDER_VALUE = 25_000;
export const DEFAULT_ATR_STOP_MULTIPLIER = 2;

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
 * Step 1 — spend band: ceiling (max cap ∧ balance) and floor (min purchase).
 * Returns null when min exceeds ceiling (trade impossible — skip symbol).
 */
export function resolvePaperSpendBand(
  settings: Pick<AppSettings, "paperMaxOrderValue" | "paperMinOrderValue">,
  balance?: number
): { ceiling: number; floor: number } | null {
  const cap = effectivePaperOrderCap(settings);
  const ceiling =
    balance != null && Number.isFinite(balance) && balance > 0
      ? Math.min(cap, balance)
      : cap;
  const floor = effectivePaperMinOrderValue(settings);
  if (floor > 0 && floor > ceiling) return null;
  return { ceiling, floor };
}

/** @deprecated use resolvePaperSpendBand */
export function resolvePaperSpendCeiling(
  settings: Pick<AppSettings, "paperMaxOrderValue">,
  balance?: number
): number {
  const band = resolvePaperSpendBand(
    { ...settings, paperMinOrderValue: 0 },
    balance
  );
  return band?.ceiling ?? effectivePaperOrderCap(settings);
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
  | "atrStopMultiplier"
>;

/**
 * Step 2 — mode-specific rupee budget within [floor, ceiling].
 * Returns 0 when the mode's target is below floor (skip — do not bump up).
 */
export function resolvePaperSizingBudget(
  settings: PaperSizingSettings,
  band: { ceiling: number; floor: number },
  options?: { balance?: number; atr?: number | null }
): number {
  const { ceiling, floor } = band;
  const mode = settings.positionSizingMode ?? "notional";
  const balance = options?.balance;

  let target = 0;

  if (mode === "portfolio_pct" && balance != null && balance > 0) {
    const pct = Math.max(0.1, settings.positionPct ?? 10);
    target = balance * (pct / 100);
  } else if (mode === "atr_risk") {
    target = Math.min(paperOrderNotional(settings), ceiling);
  } else {
    target = paperOrderNotional(settings);
  }

  const budget = Math.min(target, ceiling);
  if (floor > 0 && budget < floor) return 0;
  return budget;
}

/**
 * ATR stop-distance sizing: riskRupees = balance × risk%; stop = multiplier × ATR;
 * qty = floor(riskRupees / stop), capped by max per trade and balance; skip if below min.
 */
function resolveAtrRiskQty(
  price: number,
  settings: PaperSizingSettings,
  band: { ceiling: number; floor: number },
  balance: number,
  atr: number
): number {
  if (!Number.isFinite(atr) || atr <= 0) return 0;

  const { ceiling, floor } = band;
  const riskPct = Math.max(0.1, settings.atrRiskPct ?? 1);
  const multiplier = Math.max(
    0.5,
    settings.atrStopMultiplier ?? DEFAULT_ATR_STOP_MULTIPLIER
  );
  const riskRupees = balance * (riskPct / 100);
  const stopDistance = multiplier * atr;

  if (stopDistance <= 0) return 0;

  let qty = Math.floor(riskRupees / stopDistance);
  if (qty < 1) return 0;

  const maxQtyByCeiling = Math.floor(ceiling / price);
  if (maxQtyByCeiling < 1) return 0;
  qty = Math.min(qty, maxQtyByCeiling);

  const maxQtyByBalance = Math.floor(balance / price);
  if (maxQtyByBalance < 1) return 0;
  qty = Math.min(qty, maxQtyByBalance);

  if (floor > 0 && qty * price < floor) return 0;
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

/** Reject qty when turnover is below floor — never bump up to meet min. */
export function rejectBelowMinPaperPurchase(
  qty: number,
  price: number,
  floor: number
): number {
  if (qty < 1) return 0;
  if (floor <= 0) return qty;
  return qty * price >= floor ? qty : 0;
}

/**
 * Paper BUY size: band (max ∧ min), then mode budget/qty; skip if below min.
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
  const band = resolvePaperSpendBand(settings, balance);
  if (!band) return 0;

  const explicit = options?.strategyParams?.quantity;
  if (explicit != null && explicit > 0) {
    const qty = qtyWithinCeiling(
      Math.max(1, Math.floor(explicit)),
      price,
      band.ceiling,
      balance
    );
    return rejectBelowMinPaperPurchase(qty, price, band.floor);
  }

  const mode = settings.positionSizingMode ?? "notional";
  const atr = options?.atr;

  if (
    mode === "atr_risk" &&
    atr != null &&
    atr > 0 &&
    balance != null &&
    balance > 0
  ) {
    return resolveAtrRiskQty(price, settings, band, balance, atr);
  }

  const budget = resolvePaperSizingBudget(settings, band, { balance, atr });
  if (budget <= 0) return 0;

  const qty = integerShareQtyForBudget(price, budget, balance);
  return rejectBelowMinPaperPurchase(qty, price, band.floor);
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
    | "atrStopMultiplier"
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
  const band = resolvePaperSpendBand(settings, balance);
  if (!band) return 0;

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

  qty = qtyWithinCeiling(qty, price, band.ceiling, balance);
  qty = rejectBelowMinPaperPurchase(qty, price, band.floor);

  return qty >= 1 ? qty : 0;
}

function formatRupeeCompact(amount: number): string {
  const n = Math.round(amount);
  if (n >= 100_000) {
    const lakhs = n / 100_000;
    return `₹${Number.isInteger(lakhs) ? lakhs : lakhs.toFixed(1)}L`;
  }
  if (n >= 1000) return `₹${Math.round(n / 1000)}k`;
  return `₹${n}`;
}

/** Human-readable active paper sizing mode for UI and scan summaries. */
export function formatPaperSizingSummary(settings: PaperSizingSettings): string {
  const mode = settings.positionSizingMode ?? "notional";
  const min = effectivePaperMinOrderValue(settings);
  const max = effectivePaperOrderCap(settings);
  const band =
    min > 0
      ? `${formatRupeeCompact(min)}–${formatRupeeCompact(max)}`
      : `up to ${formatRupeeCompact(max)}`;

  if (mode === "atr_risk") {
    const risk = settings.atrRiskPct ?? 1;
    const mult = settings.atrStopMultiplier ?? DEFAULT_ATR_STOP_MULTIPLIER;
    return `ATR risk · ${risk}% of balance at risk · ${mult}× ATR stop · ${band}`;
  }
  if (mode === "portfolio_pct") {
    const pct = settings.positionPct ?? 10;
    return `${pct}% of balance per BUY · ${band}`;
  }
  return `Fixed ${formatRupeeCompact(paperOrderNotional(settings))} per BUY · ${band}`;
}

/** Per-trade sizing note for scan digest and diagnostics. */
export function formatPaperBuySizingNote(
  settings: PaperSizingSettings,
  params: {
    qty: number;
    price: number;
    balance?: number;
    atr?: number | null;
  }
): string {
  const turnover = params.qty * params.price;
  const mode = settings.positionSizingMode ?? "notional";
  const max = effectivePaperOrderCap(settings);
  const nearCap = max > 0 && turnover >= max * 0.98;

  const parts: string[] = [];

  if (mode === "atr_risk") {
    const risk = settings.atrRiskPct ?? 1;
    const mult = settings.atrStopMultiplier ?? DEFAULT_ATR_STOP_MULTIPLIER;
    if (params.atr != null && params.atr > 0) {
      const stop = mult * params.atr;
      parts.push(
        `ATR ${risk}%/${mult}× · ATR ₹${params.atr.toFixed(1)} · stop ₹${stop.toFixed(1)}`
      );
    } else {
      parts.push(`ATR ${risk}%/${mult}× · no ATR (notional fallback)`);
    }
  } else if (mode === "portfolio_pct") {
    const pct = settings.positionPct ?? 10;
    if (params.balance != null && params.balance > 0) {
      parts.push(`${pct}% of ₹${Math.round(params.balance / 1000)}k bal`);
    } else {
      parts.push(`${pct}% of balance`);
    }
  } else {
    parts.push(`fixed ${formatRupeeCompact(paperOrderNotional(settings))}`);
  }

  parts.push(`turnover ${formatRupeeCompact(turnover)}`);
  if (nearCap) parts.push("@ max cap");
  return parts.join(" · ");
}
