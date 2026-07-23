import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/firebase";
import {
  DEFAULT_PAPER_MAX_ORDER_VALUE,
  DEFAULT_PAPER_MIN_ORDER_VALUE,
} from "@/lib/portfolio/paper-position-size";

/**
 * Prefer fixed ₹ notional so cron always fills.
 * ATR / low % balance modes often skip (below min) or hit the ₹5L cap.
 */
export function effectivePositionSizingMode(
  settings: {
    positionSizingMode?: AppSettings["positionSizingMode"];
    positionPct?: number;
  }
): AppSettings["positionSizingMode"] {
  const mode = settings.positionSizingMode ?? "notional";
  if (mode === "notional") return "notional";
  // Keep explicit high % sizing; otherwise use fixed ₹ for reliable fills.
  if (mode === "portfolio_pct" && (settings.positionPct ?? 10) > 10) {
    return "portfolio_pct";
  }
  return "notional";
}

/** Align paper order size, per-trade cap, min purchase, and basic SL/TP exits. */
export function normalizeAppSettings(settings: AppSettings): AppSettings {
  const notional = Math.max(
    1000,
    settings.paperOrderNotional ?? DEFAULT_SETTINGS.paperOrderNotional ?? 100_000
  );
  const paperMaxOrderValue = Math.max(
    1000,
    settings.paperMaxOrderValue || DEFAULT_PAPER_MAX_ORDER_VALUE
  );
  const rawMin =
    settings.paperMinOrderValue ?? DEFAULT_PAPER_MIN_ORDER_VALUE;
  const paperMinOrderValue =
    rawMin <= 0 ? 0 : Math.min(paperMaxOrderValue, Math.max(1000, rawMin));
  return {
    ...settings,
    positionSizingMode: effectivePositionSizingMode(settings),
    paperOrderNotional: notional,
    paperMaxOrderValue,
    paperMinOrderValue,
    // Basic exits so paper can run end-to-end without complex sell consensus.
    autoStopLoss: true,
    autoTakeProfit: true,
    stopLossPercent:
      settings.stopLossPercent > 0 ? settings.stopLossPercent : 2,
    takeProfitPercent:
      settings.takeProfitPercent > 0 ? settings.takeProfitPercent : 5,
    autoTrailingStop: false,
    enableStrategySellSignals: false,
    maxPositions:
      settings.maxPositions && settings.maxPositions > 0
        ? settings.maxPositions
        : DEFAULT_SETTINGS.maxPositions > 0
          ? DEFAULT_SETTINGS.maxPositions
          : 5,
  };
}
