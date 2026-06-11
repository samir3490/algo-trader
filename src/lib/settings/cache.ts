import type { AppSettings } from "@/lib/firebase";
import { DEFAULT_SETTINGS } from "@/lib/firebase";
import { normalizeAppSettings } from "@/lib/settings/normalize-settings";

const CACHE_KEY = "algotrader_settings";

/** Legacy settings page stored nested sections in localStorage. */
function isNestedCache(parsed: Record<string, unknown>): boolean {
  return (
    typeof parsed.paperTrading === "object" &&
    parsed.paperTrading !== null &&
    !("simulateBrokerage" in parsed)
  );
}

function nestedCacheToFlat(parsed: Record<string, unknown>): Partial<AppSettings> {
  const pt = parsed.paperTrading as Record<string, unknown> | undefined;
  const tp = parsed.tradingPreferences as Record<string, unknown> | undefined;
  const n = parsed.notifications as Record<string, unknown> | undefined;
  const rm = parsed.riskManagement as Record<string, unknown> | undefined;

  return {
    paperStartingBalance: pt?.startingBalance as number | undefined,
    simulateBrokerage: pt?.simulateBrokerage as boolean | undefined,
    defaultQuantity: pt?.defaultQuantity as number | undefined,
    paperOrderNotional: pt?.orderNotional as number | undefined,
    paperDefaultProduct: pt?.defaultProductType as AppSettings["paperDefaultProduct"],
    defaultExchange: tp?.defaultExchange as string | undefined,
    defaultProduct: tp?.defaultProductType as string | undefined,
    defaultOrderType: tp?.defaultOrderType as string | undefined,
    maxOrderValue: tp?.maxOrderValue as number | undefined,
    maxDailyLoss: tp?.maxDailyLoss as number | undefined,
    notifyOrders: n?.orderExecution as boolean | undefined,
    notifyEmailDigest: n?.emailDigest as boolean | undefined,
    notifySkipped: n?.skippedOrders as boolean | undefined,
    notifyRiskExits: n?.riskExits as boolean | undefined,
    notifySignals: n?.strategySignals as boolean | undefined,
    notifyPnl: n?.pnlAlerts as boolean | undefined,
    stopLossPercent: rm?.stopLossPercent as number | undefined,
    takeProfitPercent: rm?.takeProfitPercent as number | undefined,
    autoStopLoss: rm?.autoStopLoss as boolean | undefined,
    autoTakeProfit: rm?.autoTakeProfit as boolean | undefined,
    maxPositions: rm?.maxPositions as number | undefined,
    squareOffTime: rm?.squareOffTime as string | undefined,
    rebuyCooldownMinutes: rm?.rebuyCooldownMinutes as number | undefined,
    maxRoundTripsPerSymbolPerDay: rm?.maxRoundTripsPerSymbolPerDay as
      | number
      | undefined,
    noSameDayRebuyAfterSell: rm?.noSameDayRebuyAfterSell as boolean | undefined,
    minHoldMinutesBeforeSell: rm?.minHoldMinutesBeforeSell as number | undefined,
  };
}

export function loadSettingsFromCache(): AppSettings {
  if (typeof window === "undefined") return normalizeAppSettings(DEFAULT_SETTINGS);
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return normalizeAppSettings(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (isNestedCache(parsed)) {
      return normalizeAppSettings({
        ...DEFAULT_SETTINGS,
        ...nestedCacheToFlat(parsed),
      } as AppSettings);
    }
    return normalizeAppSettings({
      ...DEFAULT_SETTINGS,
      ...parsed,
    } as AppSettings);
  } catch {}
  return normalizeAppSettings(DEFAULT_SETTINGS);
}

export function saveSettingsToCache(settings: Partial<AppSettings>): void {
  try {
    const merged = { ...loadSettingsFromCache(), ...settings };
    localStorage.setItem(CACHE_KEY, JSON.stringify(merged));
  } catch {}
}
