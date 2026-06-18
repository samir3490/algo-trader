import type { ActiveStrategy, AppSettings, PaperTrade } from "@/lib/firebase";
import { tradeExecutedAtMs } from "@/lib/paper-trades/normalize";

/** Rolling realized P&L for one strategy instance (SELL rows with netPnl). */
export function computeRollingStrategyInstancePnl(
  trades: PaperTrade[],
  strategyId: string,
  lookbackDays: number,
  now = Date.now()
): number {
  const cutoff = now - lookbackDays * 86_400_000;
  let pnl = 0;
  for (const t of trades) {
    if (t.side !== "SELL" || t.netPnl == null) continue;
    const id = t.ownerStrategyId ?? t.strategyId;
    if (id !== strategyId) continue;
    if (tradeExecutedAtMs(t) < cutoff) continue;
    pnl += t.netPnl;
  }
  return pnl;
}

export interface AutoPauseResult {
  strategyId: string;
  strategyName: string;
  rollingPnl: number;
  reason: string;
}

/** Strategy instances that should be paused after negative rolling P&L. */
export function evaluateAutoPause(
  strategies: ActiveStrategy[],
  trades: PaperTrade[],
  settings: Pick<
    AppSettings,
    "autoPauseEnabled" | "autoPauseLookbackDays" | "autoPauseMaxLoss"
  >
): AutoPauseResult[] {
  if (settings.autoPauseEnabled !== true) return [];

  const lookback = Math.max(1, settings.autoPauseLookbackDays ?? 14);
  const maxLoss = Math.max(0, settings.autoPauseMaxLoss ?? 5000);
  const results: AutoPauseResult[] = [];

  for (const s of strategies) {
    if (s.status !== "running") continue;
    const rolling = computeRollingStrategyInstancePnl(trades, s.id, lookback);
    if (rolling <= -maxLoss) {
      results.push({
        strategyId: s.id,
        strategyName: s.name,
        rollingPnl: rolling,
        reason: `Auto-paused: ₹${Math.abs(rolling).toFixed(0)} loss over ${lookback}d (limit ₹${maxLoss})`,
      });
    }
  }

  return results;
}
