import type { OrderRecord, PaperTradingState, StrategyRunnerMeta } from "@/lib/firebase";
import {
  detectPaperStateIssues,
  type ReconcileIssue,
} from "@/lib/portfolio/reconcile-paper-state";
import { computeStrategyPerformance } from "@/lib/strategies/strategy-performance";
import { normalizePaperTrades } from "@/lib/paper-trades/normalize";

export type HealthLevel = "ok" | "warning" | "critical";

export interface HealthAlert {
  id: string;
  level: HealthLevel;
  message: string;
}

export interface PaperTradingHealth {
  level: HealthLevel;
  checkedAt: string;
  cron: {
    lastCronAt?: string;
    lastRunAt?: string;
    stale: boolean;
    minutesSinceCron?: number;
    marketOpen: boolean;
    isWeekday: boolean;
  };
  scan: {
    lastRanAt?: string;
    scanned: number;
    signalsFound: number;
    tradesExecuted: number;
    gateBlocked: number;
    dedupeBlocked: number;
    priceCorrections: number;
    zeroTradeWithSignals: boolean;
  };
  portfolio: {
    driftIssueCount: number;
    errorCount: number;
    warningCount: number;
    issues: ReconcileIssue[];
    openPositions: number;
    balance: number;
  };
  strategyPnl: {
    strategyName: string;
    realizedPnl: number;
    closedRounds: number;
    wins: number;
    losses: number;
  }[];
  alerts: HealthAlert[];
}

const IST = "Asia/Kolkata";
/** One missed 15-min slot + buffer during market hours. */
const CRON_STALE_MINUTES = 25;

function istNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: IST }));
}

export function isWeekdayIST(now = istNow()): boolean {
  const day = now.getDay();
  return day >= 1 && day <= 5;
}

export function isMarketHoursIST(now = istNow()): boolean {
  if (!isWeekdayIST(now)) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= 9 * 60 + 15 && minutes < 15 * 60 + 30;
}

export function minutesSince(iso?: string): number | undefined {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return undefined;
  return Math.round((Date.now() - ms) / 60_000);
}

export function isCronStale(
  lastCronAt: string | undefined,
  marketOpen: boolean
): boolean {
  if (!marketOpen) return false;

  const now = istNow();
  const minutesSinceOpen = now.getHours() * 60 + now.getMinutes() - (9 * 60 + 15);

  if (!lastCronAt) {
    return minutesSinceOpen > CRON_STALE_MINUTES;
  }

  const lastDate = new Date(lastCronAt).toLocaleDateString("en-CA", {
    timeZone: IST,
  });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: IST });

  if (lastDate !== today) {
    return minutesSinceOpen > CRON_STALE_MINUTES;
  }

  const mins = minutesSince(lastCronAt);
  return mins != null && mins > CRON_STALE_MINUTES;
}

export function assessPaperTradingHealth(input: {
  runnerMeta?: StrategyRunnerMeta;
  paperState: PaperTradingState;
  orders?: OrderRecord[];
  marketOpen?: boolean;
}): PaperTradingHealth {
  const checkedAt = new Date().toISOString();
  const marketOpen = input.marketOpen ?? isMarketHoursIST();
  const weekday = isWeekdayIST();
  const meta = input.runnerMeta ?? {};
  const summary = meta.lastScanSummary;
  const diagnostics = summary?.diagnostics;

  const portfolioIssues = detectPaperStateIssues(
    input.paperState,
    input.orders ?? []
  );
  const errorCount = portfolioIssues.filter((i) => i.severity === "error").length;
  const warningCount = portfolioIssues.filter(
    (i) => i.severity === "warning"
  ).length;

  const minsSinceCron = minutesSince(meta.lastCronAt);
  const cronStale = isCronStale(meta.lastCronAt, marketOpen && weekday);

  const signalsFound = summary?.signalsFound ?? 0;
  const tradesExecuted = summary?.tradesExecuted ?? 0;
  const zeroTradeWithSignals =
    signalsFound > 0 && tradesExecuted === 0 && (diagnostics?.paperSignals ?? 0) > 0;

  const openPositions =
    input.paperState.positions?.filter(
      (p) =>
        (p.state === "OPEN" || p.state === "PARTIAL_EXIT") &&
        (p.quantity ?? 0) > 0
    ).length ??
    input.paperState.holdings?.filter((h) => (h.qty ?? 0) > 0).length ??
    0;

  const trades = normalizePaperTrades(
    input.paperState.trades ?? [],
    input.orders ?? []
  );
  const strategyRows = computeStrategyPerformance(trades).slice(0, 12);

  const alerts: HealthAlert[] = [];

  if (cronStale) {
    alerts.push({
      id: "cron_stale",
      level: "critical",
      message: meta.lastCronAt
        ? `Automated cron last ran ${minsSinceCron} min ago — expected every 15 min during market hours`
        : "No automated cron run recorded yet today",
    });
  }

  if (zeroTradeWithSignals) {
    alerts.push({
      id: "scan_zero_trades",
      level: "warning",
      message: `Last scan found ${signalsFound} signal(s) but placed 0 trades — check gates or position slots`,
    });
  }

  if (errorCount > 0) {
    alerts.push({
      id: "portfolio_drift",
      level: "critical",
      message: `Portfolio state drift detected (${errorCount} error${errorCount !== 1 ? "s" : ""}) — run Reconcile`,
    });
  } else if (warningCount > 0) {
    alerts.push({
      id: "portfolio_warnings",
      level: "warning",
      message: `${warningCount} portfolio warning(s) — consider running Reconcile`,
    });
  }

  if ((diagnostics?.priceCorrections ?? 0) > 0) {
    alerts.push({
      id: "price_corrections",
      level: "warning",
      message: `Last scan corrected ${diagnostics!.priceCorrections} execution price(s) — Yahoo hint diverged from live quote`,
    });
  }

  let level: HealthLevel = "ok";
  if (alerts.some((a) => a.level === "critical")) level = "critical";
  else if (alerts.length > 0) level = "warning";

  return {
    level,
    checkedAt,
    cron: {
      lastCronAt: meta.lastCronAt,
      lastRunAt: meta.lastRunAt,
      stale: cronStale,
      minutesSinceCron: minsSinceCron,
      marketOpen,
      isWeekday: weekday,
    },
    scan: {
      lastRanAt: summary?.ranAt,
      scanned: summary?.scanned ?? 0,
      signalsFound,
      tradesExecuted,
      gateBlocked: diagnostics?.gateBlocked ?? 0,
      dedupeBlocked: diagnostics?.dedupeBlocked ?? 0,
      priceCorrections: diagnostics?.priceCorrections ?? 0,
      zeroTradeWithSignals,
    },
    portfolio: {
      driftIssueCount: portfolioIssues.length,
      errorCount,
      warningCount,
      issues: portfolioIssues.slice(0, 20),
      openPositions,
      balance: input.paperState.balance ?? 0,
    },
    strategyPnl: strategyRows.map((r) => ({
      strategyName: r.strategyName,
      realizedPnl: r.realizedPnl,
      closedRounds: r.closedRounds,
      wins: r.wins,
      losses: r.losses,
    })),
    alerts,
  };
}
