import type { AppSettings } from "@/lib/firebase";

const DEFAULT_PAPER_NOTIONAL = 100_000;

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
