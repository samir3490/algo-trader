"use client";

import { useState } from "react";
import { AlertTriangle, BarChart3, ChevronDown, X } from "lucide-react";
import { cn, formatDateTimeIST } from "@/lib/utils";
import type { StrategyRunnerMeta } from "@/lib/firebase";
import type { ScanDetailKey } from "@/lib/strategies/scan-diagnostics";

type ScanSummary = NonNullable<StrategyRunnerMeta["lastScanSummary"]>;

function topSkipReasons(
  skipReasons: Record<string, number> | undefined,
  limit = 8
): [string, number][] {
  return Object.entries(skipReasons ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

const DETAIL_LABELS: Record<ScanDetailKey, string> = {
  buySignals: "BUY signals",
  sellSignals: "SELL signals",
  buyApproved: "BUY approved",
  sellApproved: "SELL approved",
  paperExec: "Paper executed",
  liveOnly: "Live-only signals",
  openPositions: "Open positions",
  deferred: "Deferred (rank)",
  portfolioSkip: "Portfolio skip",
  gateBlocked: "Gate blocked",
  dedupeBlocked: "Dedupe blocked",
  priceCorrected: "Price corrected",
  riskBlocked: "Risk blocked",
};

export default function LastScanPanel({
  summary,
  className,
}: {
  summary: ScanSummary | null;
  className?: string;
}) {
  const [activeDetail, setActiveDetail] = useState<ScanDetailKey | null>(null);

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
  const details = d?.details;

  function listFor(key: ScanDetailKey) {
    const fromDetails = details?.[key];
    if (fromDetails && fromDetails.length > 0) return fromDetails;
    if (key === "buyApproved" && d?.rankedBuyCandidates?.length) {
      return d.rankedBuyCandidates.map((c) => ({
        symbol: c.symbol,
        meta: `${c.signalCount} signal${c.signalCount !== 1 ? "s" : ""}`,
      }));
    }
    return fromDetails;
  }

  const activeList = activeDetail ? listFor(activeDetail) : undefined;

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
            {d?.sizingSummary && (
              <p className="mt-2 text-xs text-text-secondary">
                <span className="font-medium text-text-primary">Sizing: </span>
                {d.sizingSummary}
              </p>
            )}
          </div>
        </div>

        {d && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs min-w-[240px]">
            <Stat
              label="BUY signals"
              value={d.buySignals}
              detailKey="buySignals"
              getList={listFor}
              activeDetail={activeDetail}
              onSelect={setActiveDetail}
            />
            <Stat
              label="SELL signals"
              value={d.sellSignals}
              detailKey="sellSignals"
              getList={listFor}
              activeDetail={activeDetail}
              onSelect={setActiveDetail}
            />
            <Stat
              label="Paper exec"
              value={details?.paperExec?.length ?? summary.tradesExecuted}
              detailKey="paperExec"
              getList={listFor}
              activeDetail={activeDetail}
              onSelect={setActiveDetail}
            />
            <Stat
              label="Live only"
              value={d.liveSignals}
              detailKey="liveOnly"
              getList={listFor}
              activeDetail={activeDetail}
              onSelect={setActiveDetail}
              highlight={d.liveSignals > 0 && d.paperSignals === 0}
            />
            <Stat
              label="Open positions"
              value={d.openPositions ?? 0}
              detailKey="openPositions"
              getList={listFor}
              activeDetail={activeDetail}
              onSelect={setActiveDetail}
            />
            <Stat label="Paper balance" value={d.paperBalance ?? 0} format="currency" />
            <Stat label="Max positions" value={d.maxPositions ?? 0} />
            <Stat
              label="BUY approved"
              value={d.buyDecisions}
              detailKey="buyApproved"
              getList={listFor}
              activeDetail={activeDetail}
              onSelect={setActiveDetail}
            />
            <Stat
              label="SELL approved"
              value={d.sellDecisions}
              detailKey="sellApproved"
              getList={listFor}
              activeDetail={activeDetail}
              onSelect={setActiveDetail}
            />
            <Stat label="Slots to fill" value={d.slotsToFill ?? 0} />
            <Stat
              label="Dedupe blocked"
              value={d.dedupeBlocked}
              detailKey="dedupeBlocked"
              getList={listFor}
              activeDetail={activeDetail}
              onSelect={setActiveDetail}
            />
            <Stat
              label="Price corrected"
              value={d.priceCorrections ?? 0}
              detailKey="priceCorrected"
              getList={listFor}
              activeDetail={activeDetail}
              onSelect={setActiveDetail}
              highlight={(d.priceCorrections ?? 0) > 0}
            />
            <Stat
              label="Gate blocked"
              value={d.gateBlocked}
              detailKey="gateBlocked"
              getList={listFor}
              activeDetail={activeDetail}
              onSelect={setActiveDetail}
            />
            <Stat
              label="Risk blocked"
              value={d.riskBlocked}
              detailKey="riskBlocked"
              getList={listFor}
              activeDetail={activeDetail}
              onSelect={setActiveDetail}
            />
            <Stat
              label="Deferred (rank)"
              value={d.strengthDeferred ?? 0}
              detailKey="deferred"
              getList={listFor}
              activeDetail={activeDetail}
              onSelect={setActiveDetail}
            />
            <Stat
              label="Portfolio skip"
              value={d.skippedDecisions}
              detailKey="portfolioSkip"
              getList={listFor}
              activeDetail={activeDetail}
              onSelect={setActiveDetail}
            />
          </div>
        )}
      </div>

      {activeDetail && (
        <div className="mt-4 rounded-lg border border-accent/30 bg-bg-tertiary/30">
          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
            <p className="text-xs font-medium text-text-primary">
              {DETAIL_LABELS[activeDetail]}
              {activeList ? ` (${activeList.length})` : ""}
            </p>
            <button
              type="button"
              onClick={() => setActiveDetail(null)}
              className="rounded p-1 text-text-tertiary hover:bg-bg-hover hover:text-text-secondary"
              aria-label="Close symbol list"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {activeList && activeList.length > 0 ? (
            <ul className="max-h-56 overflow-y-auto divide-y divide-border/50">
              {activeList.map((item, i) => (
                <li
                  key={`${item.symbol}-${i}`}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-text-primary">{item.symbol}</span>
                  {item.meta && (
                    <span className="shrink-0 text-right text-xs text-text-tertiary max-w-[60%] truncate">
                      {item.meta}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-sm text-text-tertiary">
              No symbol list for this scan — run <strong className="text-text-secondary">Run scan now</strong> after deploy to capture details.
            </p>
          )}
        </div>
      )}

      {d && !activeDetail && (
        <p className="mt-3 text-[10px] text-text-tertiary">
          Click a stat with a count to see the symbol list.
        </p>
      )}

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
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  highlight,
  format,
  detailKey,
  getList,
  activeDetail,
  onSelect,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  format?: "currency";
  detailKey?: ScanDetailKey;
  getList?: (key: ScanDetailKey) => { symbol: string; meta?: string }[] | undefined;
  activeDetail?: ScanDetailKey | null;
  onSelect?: (key: ScanDetailKey | null) => void;
}) {
  const list = detailKey ? getList?.(detailKey) : undefined;
  const hasList = Boolean(list && list.length > 0);
  const clickable = Boolean(detailKey && hasList && value > 0);
  const isActive = activeDetail === detailKey;
  const display =
    format === "currency"
      ? value.toLocaleString("en-IN", { maximumFractionDigits: 2 })
      : value;

  return (
    <div
      className={cn(
        "rounded-lg bg-bg-tertiary/40 px-2.5 py-2",
        isActive && "ring-1 ring-accent/50"
      )}
    >
      <p className="text-text-tertiary">{label}</p>
      {clickable ? (
        <button
          type="button"
          onClick={() => onSelect?.(isActive ? null : detailKey!)}
          className={cn(
            "mt-0.5 inline-flex items-center gap-1 font-semibold tabular-nums underline-offset-2 hover:underline",
            highlight ? "text-amber-400" : "text-accent"
          )}
        >
          {display}
          <ChevronDown
            className={cn("h-3 w-3 transition-transform", isActive && "rotate-180")}
          />
        </button>
      ) : (
        <p
          className={cn(
            "font-semibold tabular-nums",
            highlight ? "text-amber-400" : "text-text-primary"
          )}
        >
          {display}
        </p>
      )}
    </div>
  );
}
