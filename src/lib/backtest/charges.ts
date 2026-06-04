import { computeZerodhaCharges, type ZerodhaProduct } from "@/lib/brokerage/zerodha-charges";

export interface BacktestChargeInput {
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  product?: ZerodhaProduct;
  slippagePct?: number;
}

/** SmartAlgo-style friction: Zerodha charges + configurable slippage. */
export function applyBacktestFriction(input: BacktestChargeInput): {
  fillPrice: number;
  charges: number;
  cashDelta: number;
} {
  const slippage = (input.slippagePct ?? 0.05) / 100;
  const slipMul = input.side === "BUY" ? 1 + slippage : 1 - slippage;
  const fillPrice = round4(input.price * slipMul);
  const turnover = fillPrice * input.qty;
  const product = input.product ?? "CNC";
  const breakdown = computeZerodhaCharges({
    side: input.side,
    qty: input.qty,
    price: fillPrice,
    product,
  });

  const cashDelta =
    input.side === "BUY"
      ? -(turnover + breakdown.total)
      : turnover - breakdown.total;

  return {
    fillPrice,
    charges: breakdown.total,
    cashDelta: round2(cashDelta),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
