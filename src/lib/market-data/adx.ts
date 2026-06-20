import type { OHLC } from "@/types";

function wilderSmooth(values: number[], period: number): number[] {
  const out: number[] = [];
  if (values.length < period) return out;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  out[period - 1] = sum / period;

  for (let i = period; i < values.length; i++) {
    out[i] = (out[i - 1]! * (period - 1) + values[i]!) / period;
  }
  return out;
}

/** Wilder ADX series aligned with input bars (NaN until warmed up). */
export function computeADXSeries(bars: OHLC[], period = 14): number[] {
  const n = bars.length;
  const adxOut = new Array<number>(n).fill(NaN);
  if (n < period * 2) return adxOut;

  const tr: number[] = [0];
  const plusDm: number[] = [0];
  const minusDm: number[] = [0];

  for (let i = 1; i < n; i++) {
    const cur = bars[i]!;
    const prev = bars[i - 1]!;
    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;
    plusDm[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDm[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    tr[i] = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
  }

  const smoothTr = wilderSmooth(tr.slice(1), period);
  const smoothPlus = wilderSmooth(plusDm.slice(1), period);
  const smoothMinus = wilderSmooth(minusDm.slice(1), period);

  const dx: number[] = [];
  for (let i = 0; i < smoothTr.length; i++) {
    const trVal = smoothTr[i]!;
    if (trVal <= 0) {
      dx[i] = 0;
      continue;
    }
    const plusDi = (100 * smoothPlus[i]!) / trVal;
    const minusDi = (100 * smoothMinus[i]!) / trVal;
    const denom = plusDi + minusDi;
    dx[i] = denom > 0 ? (100 * Math.abs(plusDi - minusDi)) / denom : 0;
  }

  const smoothDx = wilderSmooth(dx, period);
  for (let i = 0; i < smoothDx.length; i++) {
    adxOut[i + period] = smoothDx[i]!;
  }
  return adxOut;
}

export function latestADX(bars: OHLC[], period = 14): number | null {
  const series = computeADXSeries(bars, period);
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i]!;
    if (Number.isFinite(v)) return v;
  }
  return null;
}

/** Simple slope over the last `window` ADX readings. */
export function computeADXSlope(adxSeries: number[], window = 5): number | null {
  const valid = adxSeries.filter((v) => Number.isFinite(v));
  if (valid.length < window + 1) return null;
  const slice = valid.slice(-window - 1);
  const latest = slice[slice.length - 1]!;
  const earlier = slice[0]!;
  return (latest - earlier) / window;
}
