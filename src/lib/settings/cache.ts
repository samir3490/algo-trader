import type { AppSettings } from "@/lib/firebase";
import { DEFAULT_SETTINGS } from "@/lib/firebase";

const CACHE_KEY = "algotrader_settings";

export function loadSettingsFromCache(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

export function saveSettingsToCache(settings: AppSettings): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(settings));
  } catch {}
}
