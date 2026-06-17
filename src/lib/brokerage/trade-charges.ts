import type { PaperTrade } from "@/lib/firebase";
import {
  computeZerodhaCharges,
  chargeOtherFees,
  sumChargeBreakdown,
  type ChargeBreakdown,
  type ZerodhaProduct,
} from "./zerodha-charges";

export interface ResolvedTradeCharges extends ChargeBreakdown {
  /** True when charges were estimated (not stored on the trade). */
  estimated: boolean;
}

export function formatOtherFeesTooltip(
  c: Pick<ChargeBreakdown, "exchangeCharges" | "sebiFees" | "stampDuty">
): string {
  return [
    `Exchange: ₹${c.exchangeCharges.toFixed(2)}`,
    `SEBI: ₹${c.sebiFees.toFixed(2)}`,
    `Stamp duty: ₹${c.stampDuty.toFixed(2)}`,
  ].join("\n");
}

/** Merge stored trade legs with Zerodha schedule; total always equals component sum. */
export function resolveTradeCharges(t: PaperTrade): ResolvedTradeCharges {
  const product = (t.product ?? "CNC") as ZerodhaProduct;
  const computed = computeZerodhaCharges({
    side: t.side,
    qty: t.qty,
    price: t.price,
    product,
  });

  const merged: ChargeBreakdown = {
    brokerage: t.brokerage ?? computed.brokerage,
    stt: t.stt ?? computed.stt,
    gst: t.gst ?? computed.gst,
    exchangeCharges: t.exchangeCharges ?? computed.exchangeCharges,
    sebiFees: t.sebiFees ?? computed.sebiFees,
    stampDuty: t.stampDuty ?? computed.stampDuty,
    total: 0,
  };
  merged.total = sumChargeBreakdown(merged);

  if (typeof t.charges === "number") {
    return { ...merged, estimated: false };
  }
  return { ...computed, estimated: true };
}

export function formatChargesTooltip(c: ResolvedTradeCharges): string {
  const lines = [
    `Brokerage: ₹${c.brokerage.toFixed(2)}`,
    `STT: ₹${c.stt.toFixed(2)}`,
    `GST: ₹${c.gst.toFixed(2)}`,
    `Other (exchange + SEBI + stamp): ₹${chargeOtherFees(c).toFixed(2)}`,
    `Total: ₹${c.total.toFixed(2)}`,
  ];
  if (c.estimated) lines.push("(estimated from Zerodha schedule)");
  return lines.join("\n");
}

export { chargeOtherFees, sumChargeBreakdown };
