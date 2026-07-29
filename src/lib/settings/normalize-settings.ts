import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/firebase";
import {
  DEFAULT_PAPER_MAX_ORDER_VALUE,
  DEFAULT_PAPER_MIN_ORDER_VALUE,
} from "@/lib/portfolio/paper-position-size";

/** Simple paper loop: fixed ₹1L buys, −2% / +5% exits, minimal gates. */
export const SIMPLE_PAPER_MAX_POSITIONS = 25;
export const SIMPLE_PAPER_ORDER_NOTIONAL = 100_000;

/**
 * Prefer fixed ₹ notional so cron always fills.
 * ATR / % balance modes often skip or hit the ₹5L cap.
 */
export function effectivePositionSizingMode(
  _settings?: {
    positionSizingMode?: AppSettings["positionSizingMode"];
    positionPct?: number;
  }
): AppSettings["positionSizingMode"] {
  return "notional";
}

/** Align paper sizing, exits, and remove rebuy/cooldown blockages. */
export function normalizeAppSettings(settings: AppSettings): AppSettings {
  const paperMaxOrderValue = Math.max(
    1000,
    settings.paperMaxOrderValue || DEFAULT_PAPER_MAX_ORDER_VALUE
  );
  const paperMinOrderValue = Math.min(
    paperMaxOrderValue,
    Math.max(1000, DEFAULT_PAPER_MIN_ORDER_VALUE)
  );
  return {
    ...settings,
    positionSizingMode: "notional",
    paperOrderNotional: SIMPLE_PAPER_ORDER_NOTIONAL,
    paperMaxOrderValue,
    paperMinOrderValue,
    // Basic exits only.
    autoStopLoss: true,
    autoTakeProfit: true,
    stopLossPercent: 2,
    takeProfitPercent: 5,
    autoTrailingStop: false,
    enableStrategySellSignals: false,
    maxHoldDays: 0,
    noProgressDays: 0,
    autoPauseEnabled: false,
    // Remove rebuy / day-lock blockages that stopped fills for days.
    rebuyCooldownMinutes: 0,
    noSameDayRebuyAfterSell: false,
    maxRoundTripsPerSymbolPerDay: 0,
    minHoldMinutesBeforeSell: 0,
    // Room for new ₹1L buys while older names sit between −2% and +5%.
    maxPositions: SIMPLE_PAPER_MAX_POSITIONS,
  };
}
