import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/firebase";
import {
  DEFAULT_PAPER_MAX_ORDER_VALUE,
  DEFAULT_PAPER_MIN_ORDER_VALUE,
} from "@/lib/portfolio/paper-position-size";

/**
 * Legacy migrate-universe used portfolio_pct @ 10%, which hits the ₹5L cap once
 * balance × 10% ≥ max per trade. Prefer ATR sizing unless user chose a higher %.
 */
export function effectivePositionSizingMode(
  settings: {
    positionSizingMode?: AppSettings["positionSizingMode"];
    positionPct?: number;
  }
): AppSettings["positionSizingMode"] {
  const mode = settings.positionSizingMode ?? "atr_risk";
  if (mode === "notional" || mode === "atr_risk") return mode;
  const pct = settings.positionPct ?? 10;
  if (pct <= 10) return "atr_risk";
  return "portfolio_pct";
}

/** Align paper order size, per-trade cap, min purchase, and position limits from Firestore. */
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
    maxPositions:
      settings.maxPositions && settings.maxPositions > 0
        ? settings.maxPositions
        : DEFAULT_SETTINGS.maxPositions > 0
          ? DEFAULT_SETTINGS.maxPositions
          : 5,
  };
}
