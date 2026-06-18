import type { PaperTrade } from "@/lib/firebase";
import type { PortfolioDecision } from "@/lib/portfolio/types";

export function formatTradeAuditMessage(
  trade: PaperTrade,
  decision?: Pick<
    PortfolioDecision,
    "signalReason" | "exitReason" | "buySignalCount" | "sellSignalCount"
  >
): string {
  const side = trade.side;
  const sym = `${trade.exchange}:${trade.symbol}`;
  const strat = trade.strategyName ?? trade.ownerStrategyId ?? "Manual";
  const parts = [`${side} ${sym}`, strat, `@ ₹${trade.price.toFixed(2)} × ${trade.qty}`];

  const reason = trade.reason ?? decision?.signalReason;
  if (reason) parts.push(reason);

  if (trade.exitReason ?? decision?.exitReason) {
    parts.push(`exit: ${trade.exitReason ?? decision?.exitReason}`);
  }

  if (typeof trade.netPnl === "number" && side === "SELL") {
    parts.push(`P&L ₹${trade.netPnl.toFixed(2)}`);
  }

  const signals =
    trade.buySignalCount ??
    decision?.buySignalCount ??
    decision?.sellSignalCount;
  if (signals && signals > 0) {
    parts.push(`${signals} signal(s)`);
  }

  return parts.join(" · ");
}
