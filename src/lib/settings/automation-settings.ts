import type { AppSettings } from "@/lib/firebase";

export type AutomationMode = "paper" | "live";

/** Subset used by cron / auto-trading (paper today; live in Phase 3). */
export interface ResolvedAutomationSettings {
  enableRegimeWeighting: boolean;
  enableEntryConnectedExits: boolean;
  regimeIndexSymbol: string;
  regimeAdxPeriod: number;
  regimeAdxThreshold: number;
  regimeAdxSlopeWindow: number;
  momentumRsiOverbought: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  autoStopLoss: boolean;
  autoTakeProfit: boolean;
  maxPositions: number;
  enableStrategySellSignals: boolean;
  strategySellMinSignals: number;
  autoTrailingStop: boolean;
  trailingStopPercent: number;
  trailingStopAfterTargetPercent: number;
  minHoldMinutesBeforeSell: number;
  maxHoldDays: number;
  noProgressDays: number;
  noProgressMinPct: number;
}

function liveOrPaper<T>(mirror: boolean, liveVal: T | undefined, paperVal: T): T {
  if (mirror) return paperVal;
  return liveVal ?? paperVal;
}

/** Resolve automation settings for paper cron or future live auto-trading. */
export function resolveAutomationSettings(
  settings: AppSettings,
  mode: AutomationMode
): ResolvedAutomationSettings {
  // Default off: live capital/rules stay independent of paper.
  const mirror = settings.liveMirrorPaperAutomation === true;

  if (mode === "paper" || mirror) {
    return {
      enableRegimeWeighting: settings.enableRegimeWeighting !== false,
      enableEntryConnectedExits: settings.enableEntryConnectedExits !== false,
      regimeIndexSymbol: settings.regimeIndexSymbol ?? "^NSEI",
      regimeAdxPeriod: settings.regimeAdxPeriod ?? 14,
      regimeAdxThreshold: settings.regimeAdxThreshold ?? 23,
      regimeAdxSlopeWindow: settings.regimeAdxSlopeWindow ?? 5,
      momentumRsiOverbought: settings.momentumRsiOverbought ?? 85,
      stopLossPercent: settings.stopLossPercent ?? 2,
      takeProfitPercent: settings.takeProfitPercent ?? 5,
      autoStopLoss: settings.autoStopLoss !== false,
      autoTakeProfit: settings.autoTakeProfit !== false,
      maxPositions: settings.maxPositions ?? 5,
      enableStrategySellSignals: settings.enableStrategySellSignals === true,
      strategySellMinSignals: settings.strategySellMinSignals ?? 2,
      autoTrailingStop: settings.autoTrailingStop === true,
      trailingStopPercent: settings.trailingStopPercent ?? 2,
      trailingStopAfterTargetPercent:
        settings.trailingStopAfterTargetPercent ??
        settings.trailingStopPercent ??
        2,
      minHoldMinutesBeforeSell: settings.minHoldMinutesBeforeSell ?? 60,
      maxHoldDays: settings.maxHoldDays ?? 0,
      noProgressDays: settings.noProgressDays ?? 0,
      noProgressMinPct: settings.noProgressMinPct ?? 0.5,
    };
  }

  return {
    enableRegimeWeighting: liveOrPaper(
      false,
      settings.liveEnableRegimeWeighting,
      settings.enableRegimeWeighting !== false
    ),
    enableEntryConnectedExits: liveOrPaper(
      false,
      settings.liveEnableEntryConnectedExits,
      settings.enableEntryConnectedExits !== false
    ),
    regimeIndexSymbol: settings.regimeIndexSymbol ?? "^NSEI",
    regimeAdxPeriod: settings.regimeAdxPeriod ?? 14,
    regimeAdxThreshold: liveOrPaper(
      false,
      settings.liveRegimeAdxThreshold,
      settings.regimeAdxThreshold ?? 23
    ),
    regimeAdxSlopeWindow: settings.regimeAdxSlopeWindow ?? 5,
    momentumRsiOverbought: liveOrPaper(
      false,
      settings.liveMomentumRsiOverbought,
      settings.momentumRsiOverbought ?? 85
    ),
    stopLossPercent: liveOrPaper(
      false,
      settings.liveStopLossPercent,
      settings.stopLossPercent ?? 2
    ),
    takeProfitPercent: liveOrPaper(
      false,
      settings.liveTakeProfitPercent,
      settings.takeProfitPercent ?? 5
    ),
    autoStopLoss: liveOrPaper(
      false,
      settings.liveAutoStopLoss,
      settings.autoStopLoss !== false
    ),
    autoTakeProfit: liveOrPaper(
      false,
      settings.liveAutoTakeProfit,
      settings.autoTakeProfit === true
    ),
    maxPositions: liveOrPaper(
      false,
      settings.liveMaxPositions,
      settings.maxPositions ?? 5
    ),
    enableStrategySellSignals: liveOrPaper(
      false,
      settings.liveEnableStrategySellSignals,
      settings.enableStrategySellSignals !== false
    ),
    strategySellMinSignals: liveOrPaper(
      false,
      settings.liveStrategySellMinSignals,
      settings.strategySellMinSignals ?? 2
    ),
    autoTrailingStop: liveOrPaper(
      false,
      settings.liveAutoTrailingStop,
      settings.autoTrailingStop !== false
    ),
    trailingStopPercent: liveOrPaper(
      false,
      settings.liveTrailingStopPercent,
      settings.trailingStopPercent ?? 2
    ),
    trailingStopAfterTargetPercent: liveOrPaper(
      false,
      settings.liveTrailingStopAfterTargetPercent,
      settings.trailingStopAfterTargetPercent ??
        settings.trailingStopPercent ??
        2
    ),
    minHoldMinutesBeforeSell: liveOrPaper(
      false,
      settings.liveMinHoldMinutesBeforeSell,
      settings.minHoldMinutesBeforeSell ?? 60
    ),
    maxHoldDays: liveOrPaper(
      false,
      settings.liveMaxHoldDays,
      settings.maxHoldDays ?? 10
    ),
    noProgressDays: liveOrPaper(
      false,
      settings.liveNoProgressDays,
      settings.noProgressDays ?? 5
    ),
    noProgressMinPct: liveOrPaper(
      false,
      settings.liveNoProgressMinPct,
      settings.noProgressMinPct ?? 0.5
    ),
  };
}

/** Merge resolved automation back into AppSettings shape for portfolio/risk modules. */
export function automationAsAppSettings(
  base: AppSettings,
  resolved: ResolvedAutomationSettings
): AppSettings {
  return {
    ...base,
    ...resolved,
  };
}
