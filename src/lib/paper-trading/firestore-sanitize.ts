import type { PaperHolding, PaperTrade, PaperTradingState } from "@/lib/firebase";
import type { PaperPosition } from "@/lib/portfolio/types";
import { sanitizeForFirestore } from "@/lib/audit/sanitize-audit";

function finiteNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Firestore rejects undefined and NaN anywhere in a document. */
export function sanitizePaperTradingPayload(state: {
  balance?: number;
  holdings?: PaperHolding[];
  positions?: PaperPosition[];
  trades?: PaperTrade[];
}): {
  balance: number;
  holdings: PaperHolding[];
  positions: PaperPosition[];
  trades: PaperTrade[];
} {
  const holdings = (state.holdings ?? []).slice(0, 200).map((h) => ({
    symbol: String(h.symbol ?? "").trim().toUpperCase(),
    exchange: String(h.exchange ?? "NSE").trim().toUpperCase(),
    qty: finiteNumber(h.qty),
    avgPrice: finiteNumber(h.avgPrice),
    ltp: finiteNumber(h.ltp, finiteNumber(h.avgPrice)),
    ...(h.ownerStrategyId ? { ownerStrategyId: h.ownerStrategyId } : {}),
    ...(h.ownerStrategyName ? { ownerStrategyName: h.ownerStrategyName } : {}),
    ...(h.buySignalCount != null && h.buySignalCount > 0
      ? { buySignalCount: finiteNumber(h.buySignalCount) }
      : {}),
  }));

  const positions = (state.positions ?? []).slice(0, 200).map((p) => {
    const row: PaperPosition = {
      id: String(p.id),
      symbol: String(p.symbol ?? "").trim().toUpperCase(),
      exchange: String(p.exchange ?? "NSE").trim().toUpperCase(),
      quantity: finiteNumber(p.quantity),
      entryPrice: finiteNumber(p.entryPrice),
      ltp: finiteNumber(p.ltp, finiteNumber(p.entryPrice)),
      ownerStrategyId: String(p.ownerStrategyId ?? "manual"),
      state: p.state,
      entryTime: String(p.entryTime ?? new Date().toISOString()),
    };
    if (p.ownerStrategyName) row.ownerStrategyName = p.ownerStrategyName;
    if (p.signalReason) row.signalReason = p.signalReason;
    if (p.stopLoss != null) row.stopLoss = finiteNumber(p.stopLoss);
    if (p.target != null) row.target = finiteNumber(p.target);
    if (p.exitTime) row.exitTime = p.exitTime;
    if (p.exitPrice != null) row.exitPrice = finiteNumber(p.exitPrice);
    if (p.exitReason) row.exitReason = p.exitReason;
    if (p.product) row.product = p.product;
    if (p.buySignalCount != null && p.buySignalCount > 0) {
      row.buySignalCount = finiteNumber(p.buySignalCount);
    }
    return row;
  });

  const trades = (state.trades ?? []).slice(0, 500).map((t) => {
    const row: PaperTrade = {
      id: String(t.id),
      time: String(t.time ?? ""),
      symbol: String(t.symbol ?? "").trim().toUpperCase(),
      exchange: String(t.exchange ?? "NSE").trim().toUpperCase(),
      side: t.side,
      qty: finiteNumber(t.qty),
      price: finiteNumber(t.price),
    };
    if (t.executedAt) row.executedAt = t.executedAt;
    if (t.date) row.date = t.date;
    if (t.strategyId) row.strategyId = t.strategyId;
    if (t.ownerStrategyId) row.ownerStrategyId = t.ownerStrategyId;
    if (t.strategyName) row.strategyName = t.strategyName;
    if (t.reason) row.reason = t.reason;
    if (t.product) row.product = t.product;
    if (t.charges != null) row.charges = finiteNumber(t.charges);
    if (t.brokerage != null) row.brokerage = finiteNumber(t.brokerage);
    if (t.stt != null) row.stt = finiteNumber(t.stt);
    if (t.gst != null) row.gst = finiteNumber(t.gst);
    if (t.netPnl != null) row.netPnl = finiteNumber(t.netPnl);
    if (t.grossAmount != null) row.grossAmount = finiteNumber(t.grossAmount);
    if (t.entryTime) row.entryTime = t.entryTime;
    if (t.entryPrice != null) row.entryPrice = finiteNumber(t.entryPrice);
    if (t.exitTime) row.exitTime = t.exitTime;
    if (t.exitPrice != null) row.exitPrice = finiteNumber(t.exitPrice);
    if (t.exitReason) row.exitReason = t.exitReason;
    if (t.buySignalCount != null && t.buySignalCount > 0) {
      row.buySignalCount = finiteNumber(t.buySignalCount);
    }
    return row;
  });

  return sanitizeForFirestore({
    balance: finiteNumber(state.balance),
    holdings,
    positions,
    trades,
  }) as {
    balance: number;
    holdings: PaperHolding[];
    positions: PaperPosition[];
    trades: PaperTrade[];
  };
}

export function sanitizePaperTradingState(
  state: PaperTradingState
): ReturnType<typeof sanitizePaperTradingPayload> {
  return sanitizePaperTradingPayload(state);
}
