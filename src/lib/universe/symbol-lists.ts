import { NSE_INSTRUMENTS } from "@/lib/instruments";

export const NIFTY50_SYMBOLS = NSE_INSTRUMENTS.slice(0, 50).map((i) => i.symbol);

export const BANK_NIFTY_SYMBOLS = [
  "HDFCBANK",
  "ICICIBANK",
  "KOTAKBANK",
  "AXISBANK",
  "SBIN",
  "INDUSINDBK",
  "BANKBARODA",
  "PNB",
  "FEDERALBNK",
  "IDFCFIRSTB",
  "AUBANK",
  "BANDHANBNK",
];

export const TOP100_SYMBOLS = NSE_INSTRUMENTS.slice(0, 100).map((i) => i.symbol);

export type UniversePreset = "nifty50" | "banknifty" | "top100" | "custom";

export function resolveUniverseSymbols(
  preset: UniversePreset | undefined,
  customSymbols?: string[]
): string[] {
  if (customSymbols?.length) {
    return [...new Set(customSymbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  }
  if (preset === "nifty50") return [...NIFTY50_SYMBOLS];
  if (preset === "banknifty") return [...BANK_NIFTY_SYMBOLS];
  if (preset === "top100") return [...TOP100_SYMBOLS];
  return [];
}
