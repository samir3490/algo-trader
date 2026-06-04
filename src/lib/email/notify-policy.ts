import type { AppSettings } from "@/lib/firebase";

export type EmailCategory =
  | "executed"
  | "risk_exit"
  | "skipped"
  | "live_signal";

export function shouldSendEmailCategory(
  settings: AppSettings,
  category: EmailCategory
): boolean {
  switch (category) {
    case "executed":
      return settings.notifyOrders !== false;
    case "risk_exit":
      return (
        settings.notifyOrders !== false && settings.notifyRiskExits !== false
      );
    case "skipped":
      return settings.notifySkipped === true;
    case "live_signal":
      return settings.notifySignals === true;
    default:
      return false;
  }
}

/** Prefer one summary email per cron scan instead of one per trade. */
export function useScanDigestEmail(settings: AppSettings): boolean {
  return settings.notifyEmailDigest !== false;
}
