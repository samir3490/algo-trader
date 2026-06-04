/**
 * Approximate Zerodha equity charges (CNC delivery vs MIS intraday).
 * @see https://zerodha.com/charges
 */

export type ZerodhaProduct = "CNC" | "MIS" | "NRML";

export interface ChargeBreakdown {
  brokerage: number;
  stt: number;
  exchangeCharges: number;
  sebiFees: number;
  stampDuty: number;
  gst: number;
  total: number;
}

export interface ChargeInput {
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  product: ZerodhaProduct;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** NSE equity transaction charge ~0.00345% of turnover */
const EXCHANGE_PCT = 0.0000345;
/** SEBI ₹10 / crore */
const SEBI_PCT = 0.000001;
const GST_RATE = 0.18;

export function computeZerodhaCharges(input: ChargeInput): ChargeBreakdown {
  const turnover = input.qty * input.price;
  if (turnover <= 0) {
    return {
      brokerage: 0,
      stt: 0,
      exchangeCharges: 0,
      sebiFees: 0,
      stampDuty: 0,
      gst: 0,
      total: 0,
    };
  }

  const isIntraday = input.product === "MIS";
  let brokerage = 0;
  let stt = 0;
  let stampDuty = 0;

  if (isIntraday) {
    brokerage = Math.min(20, turnover * 0.0003);
    if (input.side === "SELL") {
      stt = turnover * 0.00025;
    }
  } else {
    // CNC delivery — ₹0 brokerage; STT on buy & sell
    brokerage = 0;
    stt = turnover * 0.001;
    if (input.side === "BUY") {
      stampDuty = turnover * 0.00015;
    }
  }

  const exchangeCharges = turnover * EXCHANGE_PCT;
  const sebiFees = turnover * SEBI_PCT;
  const gst = (brokerage + exchangeCharges + sebiFees) * GST_RATE;
  const total = round2(brokerage + stt + exchangeCharges + sebiFees + stampDuty + gst);

  return {
    brokerage: round2(brokerage),
    stt: round2(stt),
    exchangeCharges: round2(exchangeCharges),
    sebiFees: round2(sebiFees),
    stampDuty: round2(stampDuty),
    gst: round2(gst),
    total,
  };
}

/** Cash impact: positive = money leaves wallet (buy), negative = money in (sell). */
export function cashFlowForTrade(
  side: "BUY" | "SELL",
  turnover: number,
  charges: ChargeBreakdown
): number {
  if (side === "BUY") {
    return round2(turnover + charges.total);
  }
  return round2(-(turnover - charges.total));
}
