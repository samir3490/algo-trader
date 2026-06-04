import type { AppSettings, PaperTrade } from "@/lib/firebase";
import type { StructuredSignal } from "@/lib/trading/structured-signal";
import { isPastStrategyEntryCutoff } from "@/lib/core/config";
import { writeSystemLog } from "@/lib/core/system-log";
import { tradeExecutedAtMs } from "@/lib/paper-trades/normalize";

export interface RiskCheckResult {
  approved: boolean;
  reason?: string;
  checkId: string;
}

const DEFAULT_MAX_TRADES_PER_DAY = 5;
const DEFAULT_MAX_OPEN_POSITIONS = 3;

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function tradesTodayCount(trades: PaperTrade[]): number {
  const today = todayIST();
  return trades.filter(
    (t) =>
      t.date === today ||
      new Date(tradeExecutedAtMs(t)).toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata",
      }) === today
  ).length;
}

/**
 * SmartAlgo-style risk gate for structured signals (before paper execution).
 * Complements portfolio-gate (symbol churn) and paper-risk-guard (SL/TP).
 */
export function validateStructuredSignal(
  signal: StructuredSignal,
  ctx: {
    settings: AppSettings;
    balance: number;
    openPositions: number;
    trades: PaperTrade[];
    initialCapital?: number;
  }
): RiskCheckResult {
  const id = `risk-${Date.now()}`;
  const capital = ctx.initialCapital ?? ctx.settings.paperStartingBalance ?? 1_000_000;

  if (signal.signalType === "BUY" && isPastStrategyEntryCutoff()) {
    const reason = `After 3:00 PM IST entry cutoff`;
    writeSystemLog("RISK_REJECTION", "SmartRiskEngine", reason, {
      symbol: signal.symbol,
    });
    return { approved: false, reason, checkId: id };
  }

  const maxDailyLoss =
    ctx.settings.maxDailyLoss > 0
      ? ctx.settings.maxDailyLoss
      : capital * 0.01;
  let todayLoss = 0;
  const today = todayIST();
  for (const t of ctx.trades) {
    if (t.side !== "SELL" || t.netPnl == null || t.netPnl >= 0) continue;
    const d =
      t.date ??
      new Date(tradeExecutedAtMs(t)).toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata",
      });
    if (d === today) todayLoss += Math.abs(t.netPnl);
  }
  if (todayLoss >= maxDailyLoss) {
    const reason = `Max daily loss reached (${maxDailyLoss})`;
    writeSystemLog("RISK_REJECTION", "SmartRiskEngine", reason);
    return { approved: false, reason, checkId: id };
  }

  const maxOpen = ctx.settings.maxPositions ?? DEFAULT_MAX_OPEN_POSITIONS;
  if (signal.signalType === "BUY" && ctx.openPositions >= maxOpen) {
    const reason = `Max open positions (${maxOpen})`;
    writeSystemLog("RISK_REJECTION", "SmartRiskEngine", reason);
    return { approved: false, reason, checkId: id };
  }

  const maxTradesDay = DEFAULT_MAX_TRADES_PER_DAY;
  if (tradesTodayCount(ctx.trades) >= maxTradesDay) {
    const reason = `Max trades per day (${maxTradesDay})`;
    writeSystemLog("RISK_REJECTION", "SmartRiskEngine", reason);
    return { approved: false, reason, checkId: id };
  }

  if (
    signal.signalType === "BUY" &&
    signal.stopLoss == null &&
    signal.target == null &&
    !ctx.settings.autoStopLoss &&
    !ctx.settings.autoTakeProfit
  ) {
    const reason =
      "Signal missing stop_loss / target and auto SL/TP is off in Settings";
    writeSystemLog("RISK_REJECTION", "SmartRiskEngine", reason, {
      symbol: signal.symbol,
    });
    return { approved: false, reason, checkId: id };
  }

  const orderValue = signal.price * (signal.quantity ?? 1);
  if (signal.signalType === "BUY" && orderValue > ctx.balance) {
    const reason = "Insufficient balance";
    writeSystemLog("RISK_REJECTION", "SmartRiskEngine", reason);
    return { approved: false, reason, checkId: id };
  }

  return { approved: true, checkId: id };
}
