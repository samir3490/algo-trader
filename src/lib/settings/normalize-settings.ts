import { type AppSettings } from "@/lib/firebase";
import {
  DEFAULT_PAPER_MAX_ORDER_VALUE,
  DEFAULT_PAPER_MIN_ORDER_VALUE,
} from "@/lib/portfolio/paper-position-size";
import { isPaperRuleOn } from "./paper-rules";

/** Simple paper loop defaults when the matching Rules are on. */
export const SIMPLE_PAPER_MAX_POSITIONS = 25;
export const SIMPLE_PAPER_ORDER_NOTIONAL = 100_000;

/**
 * Prefer fixed ₹ notional when "Fixed ₹1L buy size" rule is on.
 */
export function effectivePositionSizingMode(
  settings?: {
    positionSizingMode?: AppSettings["positionSizingMode"];
    positionPct?: number;
    ruleFixedNotional1L?: boolean;
  }
): AppSettings["positionSizingMode"] {
  if (settings?.ruleFixedNotional1L === false) {
    return settings.positionSizingMode ?? "notional";
  }
  return "notional";
}

/** Align paper sizing / exits / locks based on Settings → Rules checkboxes. */
export function normalizeAppSettings(settings: AppSettings): AppSettings {
  const paperMaxOrderValue = Math.max(
    1000,
    settings.paperMaxOrderValue || DEFAULT_PAPER_MAX_ORDER_VALUE
  );

  let paperMinOrderValue = settings.paperMinOrderValue ?? DEFAULT_PAPER_MIN_ORDER_VALUE;
  if (isPaperRuleOn(settings, "ruleFixedNotional1L")) {
    paperMinOrderValue = Math.min(
      paperMaxOrderValue,
      Math.max(1000, DEFAULT_PAPER_MIN_ORDER_VALUE)
    );
  } else {
    paperMinOrderValue = Math.min(
      paperMaxOrderValue,
      Math.max(0, paperMinOrderValue)
    );
  }

  const next: AppSettings = {
    ...settings,
    paperMaxOrderValue,
    paperMinOrderValue,
  };

  if (isPaperRuleOn(settings, "ruleFixedNotional1L")) {
    next.positionSizingMode = "notional";
    next.paperOrderNotional = SIMPLE_PAPER_ORDER_NOTIONAL;
  }

  if (isPaperRuleOn(settings, "ruleBasicExits2and5")) {
    next.autoStopLoss = true;
    next.autoTakeProfit = true;
    next.stopLossPercent = 2;
    next.takeProfitPercent = 5;
    // Lock gains once price has moved ~+2%; don't wait for full +5% or fall back to stop.
    next.autoTrailingStop = true;
    next.trailingStopPercent = 1.5;
    next.maxHoldDays = 0;
    next.noProgressDays = 0;
    next.autoPauseEnabled = false;
  }

  if (isPaperRuleOn(settings, "ruleMaxPositions25")) {
    next.maxPositions = SIMPLE_PAPER_MAX_POSITIONS;
  }

  if (isPaperRuleOn(settings, "ruleStrategySellsOff")) {
    next.enableStrategySellSignals = false;
    next.minHoldMinutesBeforeSell = 0;
  }

  if (isPaperRuleOn(settings, "ruleClearRebuyLocks")) {
    next.rebuyCooldownMinutes = 0;
    next.noSameDayRebuyAfterSell = false;
    next.maxRoundTripsPerSymbolPerDay = 0;
  }

  // Keep notification / regime booleans as stored (Rules tab writes them).
  next.enableRegimeWeighting = isPaperRuleOn(settings, "enableRegimeWeighting");
  next.enableEntryConnectedExits = isPaperRuleOn(
    settings,
    "enableEntryConnectedExits"
  );
  next.notifyEmailDigest = isPaperRuleOn(settings, "notifyEmailDigest");
  next.notifyRiskExits = isPaperRuleOn(settings, "notifyRiskExits");
  next.notifyWeeklyShortlist = isPaperRuleOn(settings, "notifyWeeklyShortlist");

  return next;
}

/** Resolve ₹ budget for a paper BUY under current rules. */
export function resolvePaperBuyNotional(settings: AppSettings): number {
  if (isPaperRuleOn(settings, "ruleFixedNotional1L")) {
    return SIMPLE_PAPER_ORDER_NOTIONAL;
  }
  return Math.max(1000, settings.paperOrderNotional || SIMPLE_PAPER_ORDER_NOTIONAL);
}

