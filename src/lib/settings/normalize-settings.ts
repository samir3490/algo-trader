import { type AppSettings } from "@/lib/firebase";
import {
  DEFAULT_PAPER_MAX_ORDER_VALUE,
  DEFAULT_PAPER_MIN_ORDER_VALUE,
} from "@/lib/portfolio/paper-position-size";
import { isPaperRuleOn } from "./paper-rules";
import { isLiveRuleOn } from "./live-rules";

/** Simple paper loop defaults when the matching Rules are on. */
export const SIMPLE_PAPER_MAX_POSITIONS = 10;
export const SIMPLE_PAPER_ORDER_NOTIONAL = 100_000;
/** Min distinct strategy BUY signals when the quality rule is on. */
export const SIMPLE_PAPER_MIN_BUY_SIGNALS = 3;
/** Rebuy cooldown when clear-locks is off (stops same-day stop-out → rebuy loops). */
export const SIMPLE_PAPER_REBUY_COOLDOWN_MINUTES = 240;

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

/** True when stored profile still has the old clear-locks + zero-cooldown combo. */
export function hasLegacyChurnDefaults(
  settings: Pick<
    AppSettings,
    "ruleClearRebuyLocks" | "rebuyCooldownMinutes" | "noSameDayRebuyAfterSell"
  >
): boolean {
  return (
    settings.ruleClearRebuyLocks === true &&
    (settings.rebuyCooldownMinutes ?? 0) <= 0 &&
    settings.noSameDayRebuyAfterSell !== true
  );
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

  // Old default was clear-locks ON + zero cooldown (stop-out → same-day rebuy).
  const legacyChurnDefaults = hasLegacyChurnDefaults(settings);
  if (legacyChurnDefaults) {
    next.ruleClearRebuyLocks = false;
  }

  if (isPaperRuleOn(next, "ruleClearRebuyLocks")) {
    next.rebuyCooldownMinutes = 0;
    next.noSameDayRebuyAfterSell = false;
    next.maxRoundTripsPerSymbolPerDay = 0;
  } else {
    // Anti-churn gates: cooldown + same-day rebuy ban.
    if ((next.rebuyCooldownMinutes ?? 0) <= 0) {
      next.rebuyCooldownMinutes = SIMPLE_PAPER_REBUY_COOLDOWN_MINUTES;
    }
    if (legacyChurnDefaults) {
      next.noSameDayRebuyAfterSell = true;
      if ((settings.maxRoundTripsPerSymbolPerDay ?? 0) <= 0) {
        next.maxRoundTripsPerSymbolPerDay = 1;
      }
    } else if (settings.noSameDayRebuyAfterSell !== false) {
      next.noSameDayRebuyAfterSell = true;
    }
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

  // Live rules (independent of paper) — size/exits for live auto path.
  next.liveAutoTradingEnabled = isLiveRuleOn(next, "liveAutoTradingEnabled");
  next.liveRuleEnforceCapitalLimits = isLiveRuleOn(
    next,
    "liveRuleEnforceCapitalLimits"
  );
  if (isLiveRuleOn(next, "liveRuleBasicExits2and5")) {
    next.liveAutoStopLoss = true;
    next.liveAutoTakeProfit = true;
    next.liveStopLossPercent = 2;
    next.liveTakeProfitPercent = 5;
    next.liveAutoTrailingStop = true;
    next.liveTrailingStopPercent = 1.5;
  }

  // Trailing stop always on for paper + live (user-requested default).
  next.autoTrailingStop = true;
  if (!(next.trailingStopPercent > 0)) next.trailingStopPercent = 1.5;
  next.liveAutoTrailingStop = true;
  if (!(Number(next.liveTrailingStopPercent) > 0)) {
    next.liveTrailingStopPercent = 1.5;
  }
  if (isLiveRuleOn(next, "liveRuleMaxPositions10")) {
    next.liveMaxPositions = SIMPLE_PAPER_MAX_POSITIONS;
  }
  if (isLiveRuleOn(next, "liveRuleStrategySellsOff")) {
    next.liveEnableStrategySellSignals = false;
  }
  next.liveEnableRegimeWeighting = isLiveRuleOn(next, "liveRuleRegimeWeighting");
  next.liveEnableEntryConnectedExits = isLiveRuleOn(
    next,
    "liveRuleEntryConnectedExits"
  );
  // Live never mirrors paper by default — keep books independent.
  if (next.liveMirrorPaperAutomation == null) {
    next.liveMirrorPaperAutomation = false;
  }

  return next;
}

/**
 * Fields to merge back to Firestore after anti-churn / position-cap migration.
 * Returns null when nothing needs persisting.
 */
export function antiChurnSettingsPersistPatch(
  before: AppSettings,
  after: AppSettings
): Partial<AppSettings> | null {
  const patch: Partial<AppSettings> = {};
  if (before.ruleClearRebuyLocks === true && after.ruleClearRebuyLocks === false) {
    patch.ruleClearRebuyLocks = false;
    patch.rebuyCooldownMinutes = after.rebuyCooldownMinutes;
    patch.noSameDayRebuyAfterSell = after.noSameDayRebuyAfterSell;
    patch.maxRoundTripsPerSymbolPerDay = after.maxRoundTripsPerSymbolPerDay;
  }
  if (
    isPaperRuleOn(after, "ruleMaxPositions25") &&
    before.maxPositions !== after.maxPositions &&
    after.maxPositions === SIMPLE_PAPER_MAX_POSITIONS
  ) {
    patch.maxPositions = SIMPLE_PAPER_MAX_POSITIONS;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/** Resolve ₹ budget for a paper BUY under current rules. */
export function resolvePaperBuyNotional(settings: AppSettings): number {
  if (isPaperRuleOn(settings, "ruleFixedNotional1L")) {
    return SIMPLE_PAPER_ORDER_NOTIONAL;
  }
  return Math.max(1000, settings.paperOrderNotional || SIMPLE_PAPER_ORDER_NOTIONAL);
}
