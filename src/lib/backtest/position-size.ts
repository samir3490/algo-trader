/**
 * Default backtest size: ~10% of available cash per entry (min 1 share).
 * Without this, qty=1 on ₹10L makes all metrics round to zero.
 */
export function resolveBacktestQty(
  cash: number,
  price: number,
  strategyParams?: Record<string, number>
): number {
  if (price <= 0 || cash <= 0) return 1;

  const explicit = strategyParams?.quantity;
  if (explicit != null && explicit > 0) {
    return Math.max(1, Math.floor(explicit));
  }

  const positionPct = strategyParams?.positionPct ?? 10;
  const budget = cash * (positionPct / 100);
  return Math.max(1, Math.floor(budget / price));
}
