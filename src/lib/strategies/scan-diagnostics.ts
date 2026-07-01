export interface ScanSymbolDetail {
  symbol: string;
  meta?: string;
}

/** Keys for drill-down symbol lists shown in the last-scan panel. */
export type ScanDetailKey =
  | "buySignals"
  | "sellSignals"
  | "buyApproved"
  | "sellApproved"
  | "paperExec"
  | "liveOnly"
  | "openPositions"
  | "deferred"
  | "portfolioSkip"
  | "gateBlocked"
  | "dedupeBlocked"
  | "priceCorrected"
  | "riskBlocked";

export interface ScanDiagnostics {
  buySignals: number;
  sellSignals: number;
  buyDecisions: number;
  sellDecisions: number;
  sellQueueSize?: number;
  skippedDecisions: number;
  gateBlocked: number;
  riskBlocked: number;
  dedupeBlocked: number;
  priceCorrections?: number;
  liveSignals: number;
  paperSignals: number;
  strengthDeferred?: number;
  slotsToFill?: number;
  buyQueueSize?: number;
  rankedBuyCandidates?: { symbol: string; signalCount: number }[];
  skipReasons: Record<string, number>;
  openPositions?: number;
  paperBalance?: number;
  maxPositions?: number;
  /** Active position sizing mode (from settings at scan time). */
  sizingSummary?: string;
  /** Symbol lists for clickable stats in the UI. */
  details?: Partial<Record<ScanDetailKey, ScanSymbolDetail[]>>;
}

export function addScanDetail(
  diagnostics: ScanDiagnostics,
  key: ScanDetailKey,
  symbol: string,
  meta?: string
): void {
  if (!diagnostics.details) diagnostics.details = {};
  const list = diagnostics.details[key] ?? [];
  list.push(meta ? { symbol, meta } : { symbol });
  diagnostics.details[key] = list;
}

export function formatScanAuditMessage(
  signalsFound: number,
  tradesExecuted: number,
  diagnostics?: ScanDiagnostics
): string {
  const base = `Scan: ${signalsFound} signal${signalsFound !== 1 ? "s" : ""}, ${tradesExecuted} trade${tradesExecuted !== 1 ? "s" : ""} executed`;
  if (!diagnostics || tradesExecuted > 0) return base;

  const parts: string[] = [];
  if (diagnostics.buySignals > 0 || diagnostics.sellSignals > 0) {
    parts.push(`${diagnostics.buySignals} BUY / ${diagnostics.sellSignals} SELL`);
  }
  if (diagnostics.liveSignals > 0 && diagnostics.paperSignals === 0) {
    parts.push("all signals in Live mode (switch to Paper to auto-trade)");
  }
  if ((diagnostics.slotsToFill ?? 0) === 0 && diagnostics.buySignals > 0) {
    parts.push("max positions already full");
  }
  if (diagnostics.buyDecisions > 0 && tradesExecuted === 0) {
    parts.push(`${diagnostics.buyDecisions} in buy queue but none executed`);
  }
  if (diagnostics.gateBlocked > 0) {
    parts.push(`${diagnostics.gateBlocked} blocked by trade gates`);
  }
  if (diagnostics.dedupeBlocked > 0) {
    parts.push(`${diagnostics.dedupeBlocked} blocked by dedupe (same-day / 15-min window)`);
  }
  if (diagnostics.riskBlocked > 0) {
    parts.push(`${diagnostics.riskBlocked} blocked by risk limits`);
  }
  if ((diagnostics.priceCorrections ?? 0) > 0) {
    parts.push(`${diagnostics.priceCorrections} execution price(s) corrected to live quote`);
  }
  if (diagnostics.skippedDecisions > 0) {
    parts.push(`${diagnostics.skippedDecisions} skipped at portfolio layer`);
  }
  if ((diagnostics.strengthDeferred ?? 0) > 0) {
    parts.push(`${diagnostics.strengthDeferred} deferred (lower rank vs max positions)`);
  }

  const topReasons = Object.entries(diagnostics.skipReasons ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => `${reason} (${count})`);
  if (topReasons.length > 0) {
    parts.push(`blocks: ${topReasons.join("; ")}`);
  }

  return parts.length > 0 ? `${base} — ${parts.join(" · ")}` : base;
}
