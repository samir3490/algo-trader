import type { PaperTrade } from "@/lib/firebase";
import {
  computeZerodhaCharges,
  type ChargeBreakdown,
  type ZerodhaProduct,
} from "./zerodha-charges";

export interface ResolvedTradeCharges extends ChargeBreakdown {
  /** True when charges were estimated (not stored on the trade). */
  estimated: boolean;
}

export function resolveTradeCharges(t: PaperTrade): ResolvedTradeCharges {
  if (typeof t.charges === "number") {
    return {
      brokerage: t.brokerage ?? 0,
      stt: t.stt ?? 0,
      gst: t.gst ?? 0,
      exchangeCharges: t.exchangeCharges ?? 0,
      sebiFees: t.sebiFees ?? 0,
      stampDuty: t.stampDuty ?? 0,
      total: t.charges,
      estimated: false,
    };
  }

  const product = (t.product ?? "CNC") as ZerodhaProduct;
  const computed = computeZerodhaCharges({
    side: t.side,
    qty: t.qty,
    price: t.price,
    product,
  });
  return { ...computed, estimated: true };
}

export function formatChargesTooltip(c: ResolvedTradeCharges): string {
  const lines = [
    `Brokerage: ₹${c.brokerage.toFixed(2)}`,
    `STT: ₹${c.stt.toFixed(2)}`,
    `GST: ₹${c.gst.toFixed(2)}`,
    `Exchange: ₹${c.exchangeCharges.toFixed(2)}`,
    `SEBI: ₹${c.sebiFees.toFixed(2)}`,
    `Stamp duty: ₹${c.stampDuty.toFixed(2)}`,
    `Total: ₹${c.total.toFixed(2)}`,
  ];
  if (c.estimated) lines.push("(estimated from Zerodha schedule)");
  return lines.join("\n");
}
