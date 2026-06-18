"use client";

import { AlertTriangle, BarChart3 } from "lucide-react";
import { cn, formatDateTimeIST } from "@/lib/utils";
import type { StrategyRunnerMeta } from "@/lib/firebase";

type ScanSummary = NonNullable<StrategyRunnerMeta["lastScanSummary"]>;

function topSkipReasons(
  skipReasons: Record<string, number> | undefined,
  limit = 8
): [string, number][] {
  return Object.entries(skipReasons ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

export default function LastScanPanel({
  summary,
  className,
}: {
  summary: ScanSummary | null;
  className?: string;
}) {
  if (!summary) {
    return (
      <section className={cn("rounded-xl border border-border bg-bg-secondary p-5", className)}>
        <div className="flex items-start gap-3">
          <BarChart3 className="h-5 w-5 text-text-tertiary mt-0.5 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Last strategy scan</h2>
            <p className="mt-1 text-sm text-text-tertiary">
              No scan recorded yet. Use <strong className="text-text-secondary">Run scan now</strong> or wait for the scheduled cron.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const d = summary.diagnostics;
  const reasons = topSkipReasons(d?.skipReasons);
  const zeroTrades = summary.tradesExecuted === 0 && summary.signalsFound > 0;

  return (
    <section
      className={cn(
        "rounded-xl border bg-bg-secondary p-5",
        zeroTrades ? "border-amber-500/40" : "border-border",
        className
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <BarChart3
            className={cn(
              "h-5 w-5 mt-0.5 shrink-0",
              zeroTrades ? "text-amber-400" : "text-accent"
            )}
          />
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Last strategy scan</h2>
            <p className="mt-1 text-xs text-text-tertiary">
              {formatDateTimeIST(summary.ranAt)} · {summary.scanned} strategies scanned
            </p>
            <p className="mt-2 text-sm text-text-primary">
              <span className="font-medium">{summary.signalsFound}</span> signals ·{" "}
              <span className={cn("font-medium", summary.tradesExecuted > 0 && "text-emerald-400")}>
                {summary.tradesExecuted}
              </span>{" "}
              trades placed
            </p>
          </div>
        </div>

        {d && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs min-w-[240px]">
            <Stat label="BUY signals" value={d.buySignals} />
            <Stat label="SELL signals" value={d.sellSignals} />
            <Stat label="Paper exec" value={d.paperSignals} />
            <Stat label="Live only" value={d.liveSignals} highlight={d.liveSignals > 0 && d.paperSignals === 0} />
            <Stat label="Open positions" value={d.openPositions ?? 0} />
            <Stat label="Paper balance" value={d.paperBalance ?? 0} />
            <Stat label="Max positions" value={d.maxPositions ?? 0} />
            <Stat label="BUY approved" value={d.buyDecisions} />
            <Stat label="SELL approved" value={d.sellDecisions} />
            <Stat label="Slots to fill" value={d.slotsToFill ?? 0} />
            <Stat label="Dedupe blocked" value={d.dedupeBlocked} />
            <Stat label="Price corrected" value={d.priceCorrections ?? 0} highlight={(d.priceCorrections ?? 0) > 0} />
            <Stat label="Gate blocked" value={d.gateBlocked} />
            <Stat label="Risk blocked" value={d.riskBlocked} />
            <Stat label="Deferred (rank)" value={d.strengthDeferred ?? 0} />
            <Stat label="Portfolio skip" value={d.skippedDecisions} />
          </div>
        )}
      </div>

      {zeroTrades && !d && (
        <p className="mt-4 flex items-start gap-2 text-sm text-amber-300/90">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          This scan ran before diagnostics were enabled. Run <strong className="font-medium">Run scan now</strong> again after deploy to see why trades were skipped.
        </p>
      )}

      {zeroTrades && d && (
        <div className="mt-4 space-y-3">
          {d.liveSignals > 0 && d.paperSignals === 0 && (
            <p className="flex items-start gap-2 text-sm text-amber-300/90">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              Signals were found but the buy queue did not execute — check skip reasons below.
            </p>
          )}
          {d.sellSignals > 0 && d.buySignals === 0 && d.sellDecisions === 0 && (
            <p className="text-sm text-text-secondary">
              SELL signals were skipped — check min-hold, open positions, or skip reasons below. Stop-loss / take-profit still apply.
            </p>
          )}
          {d.sellSignals > 0 && d.buySignals > 0 && (
            <p className="text-sm text-text-secondary">
              Buys run before sells each scan. Symbols with both BUY and SELL signals defer the sell until a later scan (no same-scan whipsaw).
            </p>
          )}
          {(d.slotsToFill ?? 0) === 0 && (d.openPositions ?? 0) >= (d.maxPositions ?? 5) && d.buySignals > 0 && (
            <p className="text-sm text-text-secondary">
              All {d.maxPositions ?? 5} position slots are full — reset paper portfolio or wait for stop-loss / take-profit exits.
            </p>
          )}
          {(d.paperBalance ?? 0) <= 0 && d.buySignals > 0 && (
            <p className="text-sm text-amber-300/90">
              Paper balance is ₹0 — use Reset Paper Portfolio in Settings to restore starting balance.
            </p>
          )}
          {reasons.length > 0 ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-2">
                Why trades were skipped
              </p>
              <ul className="space-y-1.5">
                {reasons.map(([reason, count]) => (
                  <li
                    key={reason}
                    className="flex items-center justify-between gap-3 rounded-lg bg-bg-tertiary/50 px-3 py-2 text-sm"
                  >
                    <span className="text-text-secondary">{reason}</span>
                    <span className="shrink-0 font-mono text-xs text-text-tertiary">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-text-secondary">
              No block reasons recorded — check the Audit tab for the scan log entry.
            </p>
          )}
          <p className="text-xs text-text-tertiary">
            Full history is saved under Strategies → Audit → System audit logs (Firestore, not server memory).
          </p>
        </div>
      )}

      {d?.rankedBuyCandidates && d.rankedBuyCandidates.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-2">
            Buy rank (signals → alphabetical)
          </p>
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {d.rankedBuyCandidates.slice(0, 20).map((c, i) => (
              <li
                key={`${c.symbol}-${i}`}
                className="flex items-center justify-between gap-3 rounded-lg bg-bg-tertiary/30 px-3 py-1.5 text-sm"
              >
                <span className="text-text-secondary">
                  {i + 1}. {c.symbol}
                </span>
                <span className="shrink-0 font-mono text-xs text-text-tertiary">
                  {c.signalCount} signal{c.signalCount !== 1 ? "s" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg bg-bg-tertiary/40 px-2.5 py-2">
      <p className="text-text-tertiary">{label}</p>
      <p className={cn("font-semibold tabular-nums", highlight ? "text-amber-400" : "text-text-primary")}>
        {value}
      </p>
    </div>
  );
}
