import type { AppSettings } from "@/lib/firebase";

export const DEFAULT_PAPER_STARTING_BALANCE = 1_000_000;

export function resolvePaperStartingBalance(
  settings?: Pick<AppSettings, "paperStartingBalance"> | null
): number {
  const value = settings?.paperStartingBalance;
  if (typeof value === "number" && value > 0) return value;
  return DEFAULT_PAPER_STARTING_BALANCE;
}

/** Label for multi-strategy BUY consensus on one symbol. */
export function formatBuyStrength(signalCount: number): string {
  if (signalCount >= 5) return `Strong · ${signalCount} signals`;
  if (signalCount >= 3) return `Moderate · ${signalCount} signals`;
  if (signalCount >= 2) return `Light · ${signalCount} signals`;
  return `Single · ${signalCount} signal${signalCount !== 1 ? "s" : ""}`;
}

/** Same tier labels for consolidated strategy SELL consensus. */
export const formatSellStrength = formatBuyStrength;

export function buyStrengthTier(
  signalCount: number
): "single" | "light" | "moderate" | "strong" {
  if (signalCount >= 5) return "strong";
  if (signalCount >= 3) return "moderate";
  if (signalCount >= 2) return "light";
  return "single";
}
