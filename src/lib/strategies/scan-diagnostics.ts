export interface ScanDiagnostics {
  buySignals: number;
  sellSignals: number;
  buyDecisions: number;
  sellDecisions: number;
  skippedDecisions: number;
  gateBlocked: number;
  riskBlocked: number;
  dedupeBlocked: number;
  liveSignals: number;
  paperSignals: number;
  strengthDeferred?: number;
  skipReasons: Record<string, number>;
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
  if (diagnostics.buyDecisions > 0 && tradesExecuted === 0) {
    parts.push(`${diagnostics.buyDecisions} BUY approved but none executed`);
  }
  if (diagnostics.gateBlocked > 0) {
    parts.push(`${diagnostics.gateBlocked} blocked by trade gates`);
  }
  if (diagnostics.riskBlocked > 0) {
    parts.push(`${diagnostics.riskBlocked} blocked by risk limits`);
  }
  if (diagnostics.skippedDecisions > 0) {
    parts.push(`${diagnostics.skippedDecisions} skipped at portfolio layer`);
  }
  if ((diagnostics.strengthDeferred ?? 0) > 0) {
    parts.push(`${diagnostics.strengthDeferred} deferred (top 5 by buy strength per scan)`);
  }
  if (diagnostics.dedupeBlocked > 0) {
    parts.push(`${diagnostics.dedupeBlocked} already tried this 15-min window`);
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
