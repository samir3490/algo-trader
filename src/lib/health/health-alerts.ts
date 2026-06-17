import { sendHealthAlertEmail, type ScanDigestLine } from "@/lib/email";
import { countScanDigestLines } from "@/lib/export/scan-email-status";
import {
  isCronStale,
  isMarketHoursIST,
  minutesSince,
} from "@/lib/health/paper-trading-health";
import type { ScanDiagnostics } from "@/lib/strategies/scan-diagnostics";

function todayKeyIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function healthAlertKey(kind: string, suffix = ""): string {
  const ist = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
  const slot = Math.floor((ist.getHours() * 60 + ist.getMinutes()) / 15);
  return `HEALTH:${kind}:${todayKeyIST()}:${slot}${suffix ? `:${suffix}` : ""}`;
}

/** Send at most one health email per kind per 15-min IST window. */
export async function maybeSendCronHealthAlerts(input: {
  invokedBy?: "cron" | "manual";
  previousLastCronAt?: string;
  signalsFound: number;
  tradesExecuted: number;
  diagnostics: ScanDiagnostics;
  emailDedupe: Set<string>;
  userId: string;
  digestLines?: ScanDigestLine[];
}): Promise<void> {
  if (input.invokedBy !== "cron") return;

  const marketOpen = isMarketHoursIST();

  if (marketOpen && isCronStale(input.previousLastCronAt, true)) {
    const key = healthAlertKey("cron_stale", input.userId);
    if (!input.emailDedupe.has(key)) {
      input.emailDedupe.add(key);
      await sendHealthAlertEmail({
        kind: "cron_stale",
        title: "Cron scan may be stale",
        message:
          "Automated strategy cron has not run recently during market hours. Check GitHub Actions and Vercel CRON_SECRET.",
        details: {
          lastCronAt: input.previousLastCronAt ?? "never",
          minutesSince: minutesSince(input.previousLastCronAt) ?? "n/a",
        },
      });
    }
  }

  const paperSignals = input.diagnostics.paperSignals ?? 0;
  const digestCounts = countScanDigestLines(input.digestLines ?? []);
  const hadPlacements =
    input.tradesExecuted > 0 ||
    digestCounts.executed > 0 ||
    digestCounts.risk > 0;
  if (input.signalsFound > 0 && paperSignals > 0 && !hadPlacements) {
    const key = healthAlertKey("scan_zero_trades", input.userId);
    if (!input.emailDedupe.has(key)) {
      input.emailDedupe.add(key);
      await sendHealthAlertEmail({
        kind: "scan_zero_trades",
        title: "Scan found signals but placed no trades",
        message:
          "A cron scan detected paper BUY signals but executed zero orders. Review trade gates, position slots, or balance on the Dashboard.",
        details: {
          signals: input.signalsFound,
          gateBlocked: input.diagnostics.gateBlocked,
          dedupeBlocked: input.diagnostics.dedupeBlocked,
          openPositions: input.diagnostics.openPositions ?? 0,
        },
      });
    }
  }

  const corrections = input.diagnostics.priceCorrections ?? 0;
  if (corrections > 0) {
    const key = healthAlertKey("price_corrections", input.userId);
    if (!input.emailDedupe.has(key)) {
      input.emailDedupe.add(key);
      await sendHealthAlertEmail({
        kind: "price_corrections",
        title: "Execution prices corrected",
        message: `${corrections} signal hint price(s) were replaced with live Yahoo quotes (>8% divergence).`,
        details: { corrections },
      });
    }
  }
}

export async function sendCronFailureAlert(error: string): Promise<void> {
  await sendHealthAlertEmail({
    kind: "cron_failed",
    title: "Strategy cron failed",
    message: error,
  });
}
