import type { AppSettings, PaperTradingState } from "@/lib/firebase";
import {
  applyPaperRiskExits,
  isMisProduct,
  isPastMisSquareOff,
  type RiskExitSignal,
} from "@/lib/risk/paper-risk-guard";
import { ensurePositions, getOpenPositions } from "@/lib/portfolio/position-manager";
import { executePortfolioDecision } from "@/lib/portfolio/order-engine";

export interface MisSquareOffResult {
  state: PaperTradingState;
  exits: RiskExitSignal[];
  skippedReason?: string;
}

/**
 * Force-exit MIS positions at or after square-off time.
 * Used by the dedicated square-off cron so CNC positions are untouched.
 */
export function applyMisSquareOffOnly(
  state: PaperTradingState,
  settings: AppSettings,
  now = new Date()
): MisSquareOffResult {
  if (!isPastMisSquareOff(settings.squareOffTime, now)) {
    return {
      state,
      exits: [],
      skippedReason: `Before square-off time (${settings.squareOffTime} IST)`,
    };
  }

  let current = ensurePositions(state);
  const exits: RiskExitSignal[] = [];
  const open = getOpenPositions(current).filter((p) =>
    isMisProduct(p.product, settings)
  );

  for (const position of open) {
    const price = position.ltp > 0 ? position.ltp : position.entryPrice;
    const pnlPercent =
      position.entryPrice > 0
        ? ((price - position.entryPrice) / position.entryPrice) * 100
        : 0;
    const signal: RiskExitSignal = {
      symbol: position.symbol,
      exchange: position.exchange,
      reason: "mis_square_off",
      message: `MIS square-off (${settings.squareOffTime} IST)`,
      pnlPercent,
    };

    const result = executePortfolioDecision(
      current,
      {
        action: "SELL",
        symbol: position.symbol,
        exchange: position.exchange,
        ownerStrategyId: position.ownerStrategyId,
        ownerStrategyName: position.ownerStrategyName ?? "Risk guard",
        price,
        quantity: position.quantity,
        signalReason: signal.message,
        exitReason: "MIS_SQUARE_OFF",
        positionId: position.id,
      },
      {
        simulateBrokerage: settings.simulateBrokerage,
        product: "MIS",
      }
    );

    if (result.executed && result.trade) {
      current = result.state;
      exits.push({
        ...signal,
        qty: result.trade.qty,
        price: result.trade.price,
      });
    }
  }

  if (open.length === 0 && isMisProduct(settings.paperDefaultProduct, settings)) {
    const riskResult = applyPaperRiskExits(
      current,
      { ...settings, paperDefaultProduct: "MIS" },
      now
    );
    const misExits = riskResult.exits.filter((e) => e.reason === "mis_square_off");
    if (misExits.length > 0) {
      return { state: riskResult.state, exits: misExits };
    }
  }

  return { state: current, exits };
}
