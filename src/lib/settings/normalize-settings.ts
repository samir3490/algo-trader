import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/firebase";

/** Align paper order size, max order value, and position limits from Firestore. */
export function normalizeAppSettings(settings: AppSettings): AppSettings {
  const notional = Math.max(
    1000,
    settings.paperOrderNotional ?? DEFAULT_SETTINGS.paperOrderNotional ?? 100_000
  );
  return {
    ...settings,
    paperOrderNotional: notional,
    maxOrderValue: Math.max(settings.maxOrderValue ?? 0, notional),
    maxPositions:
      settings.maxPositions && settings.maxPositions > 0
        ? settings.maxPositions
        : DEFAULT_SETTINGS.maxPositions > 0
          ? DEFAULT_SETTINGS.maxPositions
          : 5,
  };
}
