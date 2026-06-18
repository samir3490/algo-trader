import type { OHLC } from "@/types";

/** Wilder-style ATR over the last `period` bars (needs period + 1 bars minimum). */
export function computeATR(bars: OHLC[], period = 14): number | null {
  if (bars.length < period + 1 || period < 1) return null;

  const slice = bars.slice(-(period + 1));
  let atr = 0;
  for (let i = 1; i < slice.length; i++) {
    const cur = slice[i];
    const prev = slice[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    atr += tr;
  }
  return atr / period;
}
