import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { appendUserAuditLogAdmin } from "@/lib/audit/user-audit-log-server";
import { formatTradeAuditMessage } from "@/lib/audit/trade-execution-audit";
import { sendDailyPnlEmail, sendWeeklyShortlistEmail } from "@/lib/email";
import { resolvePaperStartingBalance } from "@/lib/paper-trading/balance";
import {
  listStrategyUserIds,
  loadPaperStateAdmin,
  loadRunnerMetaAdmin,
  loadUserSettingsAdmin,
} from "./admin-data";
import {
  buildDailyPnlReport,
  shouldSendDailyPnlToday,
} from "./daily-pnl";
import {
  buildWeeklyShortlistReport,
  shouldSendWeeklyShortlist,
} from "@/lib/export/weekly-shortlist";
import { applyMisSquareOffOnly } from "./mis-square-off";
import { persistPaperStateAdmin } from "./paper-persist";
import { persistNewPaperTradesAsOrdersAdmin } from "@/lib/portfolio/paper-order-record-server";

export interface ComplianceRunResult {
  ok: boolean;
  ranAt: string;
  usersProcessed: number;
  results: { userId: string; action: string; detail?: string }[];
  error?: string;
}

export async function runDailyPnlForAllUsers(): Promise<ComplianceRunResult> {
  const ranAt = new Date().toISOString();
  if (!isFirebaseAdminConfigured()) {
    return {
      ok: false,
      ranAt,
      usersProcessed: 0,
      results: [],
      error: "FIREBASE_SERVICE_ACCOUNT_JSON not configured",
    };
  }

  const db = getAdminFirestore();
  const userIds = await listStrategyUserIds(db);
  const results: ComplianceRunResult["results"] = [];

  for (const userId of userIds) {
    try {
      const [settings, paper, meta] = await Promise.all([
        loadUserSettingsAdmin(db, userId),
        loadPaperStateAdmin(db, userId),
        loadRunnerMetaAdmin(db, userId),
      ]);

      if (!settings.notifyPnl) {
        results.push({ userId, action: "skipped", detail: "notifyPnl off" });
        continue;
      }

      if (!shouldSendDailyPnlToday(meta.lastDailyPnlEmailDate)) {
        results.push({ userId, action: "skipped", detail: "already sent today" });
        continue;
      }

      const startingBalance = resolvePaperStartingBalance(settings);
      const report = buildDailyPnlReport(
        paper.trades ?? [],
        paper.holdings ?? [],
        paper.balance ?? startingBalance,
        startingBalance
      );

      await sendDailyPnlEmail(report);

      await db.doc(`users/${userId}/data/strategyRunner`).set(
        {
          lastDailyPnlEmailDate: report.dateIST,
          lastDailyPnlEmailAt: ranAt,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await appendUserAuditLogAdmin(db, userId, {
        severity: "INFO",
        source: "DailyPnl",
        message: `Daily P&L email sent — today ₹${report.todayRealizedPnl.toFixed(2)}, all-time ₹${report.allTimePnl.toFixed(2)}`,
        meta: { ...report },
      });

      results.push({
        userId,
        action: "emailed",
        detail: `today ${report.todayRealizedPnl}`,
      });
    } catch (e) {
      results.push({
        userId,
        action: "error",
        detail: e instanceof Error ? e.message : "error",
      });
    }
  }

  return { ok: true, ranAt, usersProcessed: userIds.length, results };
}

export async function runWeeklyShortlistForAllUsers(): Promise<ComplianceRunResult> {
  const ranAt = new Date().toISOString();
  const now = new Date();
  if (!isFirebaseAdminConfigured()) {
    return {
      ok: false,
      ranAt,
      usersProcessed: 0,
      results: [],
      error: "FIREBASE_SERVICE_ACCOUNT_JSON not configured",
    };
  }

  const db = getAdminFirestore();
  const userIds = await listStrategyUserIds(db);
  const results: ComplianceRunResult["results"] = [];

  for (const userId of userIds) {
    try {
      const [settings, meta] = await Promise.all([
        loadUserSettingsAdmin(db, userId),
        loadRunnerMetaAdmin(db, userId),
      ]);

      // Default on — only skip when explicitly disabled.
      if (settings.notifyWeeklyShortlist === false) {
        results.push({
          userId,
          action: "skipped",
          detail: "notifyWeeklyShortlist off",
        });
        continue;
      }

      if (!shouldSendWeeklyShortlist(meta.lastWeeklyShortlistEmailWeekKey, now)) {
        results.push({
          userId,
          action: "skipped",
          detail: "already sent this week",
        });
        continue;
      }

      const report = buildWeeklyShortlistReport(
        meta.shortlistDayRollups ?? {},
        now
      );

      await sendWeeklyShortlistEmail(report);

      await db.doc(`users/${userId}/data/strategyRunner`).set(
        {
          lastWeeklyShortlistEmailWeekKey: report.weekKey,
          lastWeeklyShortlistEmailAt: ranAt,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await appendUserAuditLogAdmin(db, userId, {
        severity: "INFO",
        source: "WeeklyShortlist",
        message: `Weekly shortlist email — ${report.shortlisted.length} shortlisted, ${report.bought.length} bought, ${report.notBought.length} not bought`,
        meta: {
          weekKey: report.weekKey,
          shortlisted: report.shortlisted.length,
          bought: report.bought.length,
          notBought: report.notBought.length,
          scanCount: report.scanCount,
        },
      });

      results.push({
        userId,
        action: "emailed",
        detail: `${report.shortlisted.length} shortlisted / ${report.bought.length} bought`,
      });
    } catch (e) {
      results.push({
        userId,
        action: "error",
        detail: e instanceof Error ? e.message : "error",
      });
    }
  }

  return { ok: true, ranAt, usersProcessed: userIds.length, results };
}

export async function runMisSquareOffForAllUsers(): Promise<ComplianceRunResult> {
  const ranAt = new Date().toISOString();
  if (!isFirebaseAdminConfigured()) {
    return {
      ok: false,
      ranAt,
      usersProcessed: 0,
      results: [],
      error: "FIREBASE_SERVICE_ACCOUNT_JSON not configured",
    };
  }

  const db = getAdminFirestore();
  const userIds = await listStrategyUserIds(db);
  const results: ComplianceRunResult["results"] = [];

  for (const userId of userIds) {
    try {
      const settings = await loadUserSettingsAdmin(db, userId);
      const paper = await loadPaperStateAdmin(db, userId);
      const tradesBefore = paper.trades ?? [];
      const { state, exits, skippedReason } = applyMisSquareOffOnly(
        paper,
        settings
      );

      if (exits.length === 0) {
        results.push({
          userId,
          action: "none",
          detail: skippedReason ?? "no MIS positions",
        });
        continue;
      }

      const saved = await persistPaperStateAdmin(db, userId, state);
      if (!saved.ok) {
        results.push({ userId, action: "error", detail: saved.error });
        continue;
      }

      await persistNewPaperTradesAsOrdersAdmin(
        db,
        userId,
        tradesBefore,
        state.trades ?? [],
        { product: "MIS" }
      );

      for (const exit of exits) {
        const trade = (state.trades ?? []).find(
          (t) =>
            t.side === "SELL" &&
            t.symbol === exit.symbol &&
            t.exitReason === "MIS_SQUARE_OFF"
        );
        await appendUserAuditLogAdmin(db, userId, {
          severity: "INFO",
          source: "MisSquareOff",
          message: trade
            ? formatTradeAuditMessage(trade)
            : `MIS square-off ${exit.symbol} — ${exit.message}`,
          meta: {
            symbol: exit.symbol,
            exchange: exit.exchange,
            reason: exit.reason,
            pnlPercent: exit.pnlPercent,
          },
        });
      }

      results.push({
        userId,
        action: "squared_off",
        detail: `${exits.length} position(s)`,
      });
    } catch (e) {
      results.push({
        userId,
        action: "error",
        detail: e instanceof Error ? e.message : "error",
      });
    }
  }

  return { ok: true, ranAt, usersProcessed: userIds.length, results };
}
