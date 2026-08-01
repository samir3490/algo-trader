import type { ScanDiagnostics } from "@/lib/strategies/scan-diagnostics";
import { todayDateKeyIST } from "@/lib/portfolio/compute-portfolio";

export interface ShortlistSymbolOutcome {
  symbol: string;
  signalCount: number;
  /** Why it was bought (strategy / strength). */
  boughtReason?: string;
  /** Why it was not bought. */
  skipReason?: string;
}

export interface ShortlistDayRollup {
  dateIST: string;
  lastRanAt: string;
  scanCount: number;
  buySignals: number;
  tradesExecuted: number;
  /** Ranked shortlist (max signal count seen that day). */
  ranked: { symbol: string; signalCount: number }[];
  /** Symbols filled that day. */
  bought: { symbol: string; reason: string }[];
  /** Shortlisted but not filled. */
  notBought: { symbol: string; signalCount: number; reason: string }[];
  skipReasonTotals: Record<string, number>;
}

export interface WeeklyShortlistReport {
  weekKey: string;
  weekLabel: string;
  fromDateIST: string;
  toDateIST: string;
  scanCount: number;
  buySignals: number;
  tradesExecuted: number;
  shortlisted: ShortlistSymbolOutcome[];
  bought: { symbol: string; reason: string; days: number }[];
  notBought: { symbol: string; signalCount: number; reason: string; days: number }[];
  topSkipReasons: { reason: string; count: number }[];
}

const MAX_RANKED = 25;
const MAX_OUTCOMES = 40;
const KEEP_DAYS = 14;

export function mondayOfWeekIST(now = new Date()): string {
  const dateIST = todayDateKeyIST(now);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).format(now);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const d = map[weekday] ?? 1;
  const offset = d === 0 ? -6 : 1 - d;
  // Anchor at IST noon then shift by calendar days.
  const mondayMs =
    new Date(`${dateIST}T12:00:00+05:30`).getTime() + offset * 86_400_000;
  return new Date(mondayMs).toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
}

/** ISO-like week key from Monday date, e.g. 2026-07-28. */
export function weekKeyIST(now = new Date()): string {
  return mondayOfWeekIST(now);
}

export function shouldSendWeeklyShortlist(
  lastSentWeekKey: string | undefined,
  now = new Date()
): boolean {
  return lastSentWeekKey !== weekKeyIST(now);
}

function mergeReasonTotals(
  a: Record<string, number>,
  b: Record<string, number>
): Record<string, number> {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

function reasonForSymbol(
  symbol: string,
  diagnostics: ScanDiagnostics
): string | undefined {
  const details = diagnostics.details ?? {};
  const keys = [
    "gateBlocked",
    "dedupeBlocked",
    "deferred",
    "portfolioSkip",
    "riskBlocked",
  ] as const;
  for (const key of keys) {
    const hit = details[key]?.find(
      (d) => d.symbol.toUpperCase() === symbol.toUpperCase()
    );
    if (hit?.meta) return hit.meta;
    if (hit) {
      if (key === "deferred") return "Lower buy rank — position slots full";
      if (key === "gateBlocked") return "Blocked by trade gate";
      if (key === "dedupeBlocked") return "Blocked by dedupe";
      if (key === "portfolioSkip") return "Skipped at portfolio layer";
      if (key === "riskBlocked") return "Blocked by risk limits";
    }
  }
  const top = Object.entries(diagnostics.skipReasons ?? {}).sort(
    (a, b) => b[1] - a[1]
  )[0];
  if (top) return top[0];
  if ((diagnostics.slotsToFill ?? 0) === 0) {
    return "No open position slots";
  }
  return "Shortlisted but not filled this scan";
}

/** Merge one scan's diagnostics into the IST day rollup. */
export function mergeScanIntoDayRollup(
  existing: ShortlistDayRollup | undefined,
  diagnostics: ScanDiagnostics,
  options: { dateIST: string; ranAt: string; tradesExecuted: number }
): ShortlistDayRollup {
  const base: ShortlistDayRollup = existing ?? {
    dateIST: options.dateIST,
    lastRanAt: options.ranAt,
    scanCount: 0,
    buySignals: 0,
    tradesExecuted: 0,
    ranked: [],
    bought: [],
    notBought: [],
    skipReasonTotals: {},
  };

  const rankedMap = new Map(
    base.ranked.map((r) => [r.symbol.toUpperCase(), { ...r }])
  );
  for (const c of diagnostics.rankedBuyCandidates ?? []) {
    const key = c.symbol.toUpperCase();
    const prev = rankedMap.get(key);
    if (!prev || c.signalCount > prev.signalCount) {
      rankedMap.set(key, { symbol: c.symbol.toUpperCase(), signalCount: c.signalCount });
    }
  }

  const boughtMap = new Map(
    base.bought.map((b) => [b.symbol.toUpperCase(), b])
  );
  for (const exec of diagnostics.details?.paperExec ?? []) {
    if (!exec.symbol) continue;
    // paperExec also logs SELLs — only BUY fills count as "bought".
    if (exec.meta && !/^BUY\b/i.test(exec.meta)) continue;
    const key = exec.symbol.toUpperCase();
    boughtMap.set(key, {
      symbol: key,
      reason: exec.meta ?? "Paper BUY executed",
    });
  }

  const notBoughtMap = new Map(
    base.notBought.map((n) => [n.symbol.toUpperCase(), n])
  );
  for (const c of rankedMap.values()) {
    if (boughtMap.has(c.symbol.toUpperCase())) {
      notBoughtMap.delete(c.symbol.toUpperCase());
      continue;
    }
    const reason = reasonForSymbol(c.symbol, diagnostics);
    const prev = notBoughtMap.get(c.symbol.toUpperCase());
    notBoughtMap.set(c.symbol.toUpperCase(), {
      symbol: c.symbol.toUpperCase(),
      signalCount: Math.max(prev?.signalCount ?? 0, c.signalCount),
      reason: reason ?? prev?.reason ?? "Shortlisted but not filled",
    });
  }

  const ranked = [...rankedMap.values()]
    .sort((a, b) => b.signalCount - a.signalCount || a.symbol.localeCompare(b.symbol))
    .slice(0, MAX_RANKED);

  return {
    dateIST: options.dateIST,
    lastRanAt: options.ranAt,
    scanCount: base.scanCount + 1,
    buySignals: base.buySignals + (diagnostics.buySignals ?? 0),
    tradesExecuted: base.tradesExecuted + options.tradesExecuted,
    ranked,
    bought: [...boughtMap.values()].slice(0, MAX_OUTCOMES),
    notBought: [...notBoughtMap.values()]
      .sort((a, b) => b.signalCount - a.signalCount)
      .slice(0, MAX_OUTCOMES),
    skipReasonTotals: mergeReasonTotals(
      base.skipReasonTotals,
      diagnostics.skipReasons ?? {}
    ),
  };
}

export function pruneShortlistDayRollups(
  rollups: Record<string, ShortlistDayRollup>,
  now = new Date()
): Record<string, ShortlistDayRollup> {
  const today = todayDateKeyIST(now);
  const cutoff = new Date(`${today}T12:00:00+05:30`);
  cutoff.setUTCDate(cutoff.getUTCDate() - KEEP_DAYS);
  const cutoffKey = cutoff.toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });

  const out: Record<string, ShortlistDayRollup> = {};
  for (const [k, v] of Object.entries(rollups)) {
    if (k >= cutoffKey) out[k] = v;
  }
  return out;
}

/** Build weekly report from day rollups (Mon–Sun of current week key). */
export function buildWeeklyShortlistReport(
  rollups: Record<string, ShortlistDayRollup>,
  now = new Date()
): WeeklyShortlistReport {
  const weekKey = weekKeyIST(now);
  const monday = new Date(`${weekKey}T12:00:00+05:30`);
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    days.push(
      d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    );
  }

  const weekRollups = days
    .map((d) => rollups[d])
    .filter((r): r is ShortlistDayRollup => Boolean(r));

  const rankedMap = new Map<string, ShortlistSymbolOutcome>();
  const boughtMap = new Map<string, { symbol: string; reason: string; days: number }>();
  const notBoughtMap = new Map<
    string,
    { symbol: string; signalCount: number; reason: string; days: number }
  >();
  let skipReasonTotals: Record<string, number> = {};
  let scanCount = 0;
  let buySignals = 0;
  let tradesExecuted = 0;

  for (const day of weekRollups) {
    scanCount += day.scanCount;
    buySignals += day.buySignals;
    tradesExecuted += day.tradesExecuted;
    skipReasonTotals = mergeReasonTotals(skipReasonTotals, day.skipReasonTotals);

    for (const r of day.ranked) {
      const key = r.symbol.toUpperCase();
      const prev = rankedMap.get(key);
      rankedMap.set(key, {
        symbol: key,
        signalCount: Math.max(prev?.signalCount ?? 0, r.signalCount),
        boughtReason: prev?.boughtReason,
        skipReason: prev?.skipReason,
      });
    }

    for (const b of day.bought) {
      const key = b.symbol.toUpperCase();
      const prev = boughtMap.get(key);
      boughtMap.set(key, {
        symbol: key,
        reason: b.reason || prev?.reason || "Paper BUY executed",
        days: (prev?.days ?? 0) + 1,
      });
      const ranked = rankedMap.get(key);
      if (ranked) {
        rankedMap.set(key, { ...ranked, boughtReason: b.reason, skipReason: undefined });
      }
    }

    for (const n of day.notBought) {
      const key = n.symbol.toUpperCase();
      if (boughtMap.has(key)) continue;
      const prev = notBoughtMap.get(key);
      notBoughtMap.set(key, {
        symbol: key,
        signalCount: Math.max(prev?.signalCount ?? 0, n.signalCount),
        reason: n.reason || prev?.reason || "Shortlisted but not filled",
        days: (prev?.days ?? 0) + 1,
      });
      const ranked = rankedMap.get(key);
      if (ranked && !ranked.boughtReason) {
        rankedMap.set(key, {
          ...ranked,
          skipReason: n.reason || ranked.skipReason,
        });
      }
    }
  }

  const shortlisted = [...rankedMap.values()].sort(
    (a, b) => b.signalCount - a.signalCount || a.symbol.localeCompare(b.symbol)
  );

  const sunday = days[6] ?? days[days.length - 1];
  const weekLabel = `${weekKey} → ${sunday}`;

  return {
    weekKey,
    weekLabel,
    fromDateIST: weekKey,
    toDateIST: sunday,
    scanCount,
    buySignals,
    tradesExecuted,
    shortlisted: shortlisted.slice(0, MAX_RANKED),
    bought: [...boughtMap.values()].sort((a, b) => b.days - a.days),
    notBought: [...notBoughtMap.values()].sort(
      (a, b) => b.signalCount - a.signalCount
    ),
    topSkipReasons: Object.entries(skipReasonTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([reason, count]) => ({ reason, count })),
  };
}
