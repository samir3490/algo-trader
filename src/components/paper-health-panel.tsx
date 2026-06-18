import { useCallback, useEffect, useMemo, useState } from "react";
import { useTableSort } from "@/hooks/use-table-sort";
import SortableTh from "@/components/ui/sortable-th";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Wrench,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn, formatCurrency, formatDateTimeIST } from "@/lib/utils";
import type { PaperTradingHealth } from "@/lib/health/paper-trading-health";

const LEVEL_STYLES = {
  ok: {
    border: "border-emerald-500/30",
    icon: CheckCircle2,
    iconClass: "text-emerald-400",
    badge: "bg-emerald-500/15 text-emerald-400",
    label: "Healthy",
  },
  warning: {
    border: "border-amber-500/40",
    icon: AlertTriangle,
    iconClass: "text-amber-400",
    badge: "bg-amber-500/15 text-amber-400",
    label: "Warnings",
  },
  critical: {
    border: "border-red-500/40",
    icon: XCircle,
    iconClass: "text-red-400",
    badge: "bg-red-500/15 text-red-400",
    label: "Needs attention",
  },
} as const;

export default function PaperHealthPanel({ className }: { className?: string }) {
  const { user } = useAuth();
  const [health, setHealth] = useState<PaperTradingHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileMsg, setReconcileMsg] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/paper/health", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Health check failed");
      setHealth(data.health);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Health check failed");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchHealth();
  }, [fetchHealth]);

  const runReconcile = async () => {
    if (!user) return;
    setReconciling(true);
    setReconcileMsg(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/paper/reconcile", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Reconcile failed");
      if (data.changes?.length) {
        setReconcileMsg(`Fixed: ${data.changes.join("; ")}`);
        window.dispatchEvent(new Event("paper-trading-updated"));
      } else if (data.issueCount === 0) {
        setReconcileMsg("Portfolio state is already in sync.");
      } else {
        setReconcileMsg(
          `${data.issueCount} issue(s) remain — see details below.`
        );
      }
      await fetchHealth();
    } catch (e) {
      setReconcileMsg(e instanceof Error ? e.message : "Reconcile failed");
    } finally {
      setReconciling(false);
    }
  };

  const { sortKey, sortDir, toggleSort, sortRows } = useTableSort({
    key: "pnl",
    dir: "desc",
  });
  const sortedStrategyPnl = useMemo(
    () =>
      health
        ? sortRows(health.strategyPnl, {
            strategy: (r) => r.strategyName,
            pnl: (r) => r.realizedPnl,
            rounds: (r) => r.closedRounds,
            wl: (r) => r.wins - r.losses,
          })
        : [],
    [health, sortRows]
  );

  if (!user) return null;

  const level = health?.level ?? "ok";
  const styles = LEVEL_STYLES[level];
  const StatusIcon = styles.icon;

  return (
    <section
      className={cn(
        "rounded-xl border bg-bg-secondary p-5",
        health ? styles.border : "border-border",
        className
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-text-tertiary mt-0.5" />
          ) : (
            <StatusIcon className={cn("h-5 w-5 mt-0.5 shrink-0", styles.iconClass)} />
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-text-primary">
                Paper trading health
              </h2>
              {health && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    styles.badge
                  )}
                >
                  {styles.label}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-text-tertiary">
              Cron status, scan diagnostics, portfolio drift
              {health?.checkedAt && (
                <> · checked {formatDateTimeIST(health.checkedAt)}</>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void fetchHealth()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-hover transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void runReconcile()}
            disabled={reconciling || loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent transition-colors disabled:opacity-50"
          >
            {reconciling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wrench className="h-3.5 w-3.5" />
            )}
            Reconcile
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-400">{error}</p>
      )}

      {reconcileMsg && (
        <p className="mt-3 text-sm text-text-secondary">{reconcileMsg}</p>
      )}

      {health && !loading && (
        <div className="mt-4 space-y-4">
          {health.alerts.length > 0 && (
            <ul className="space-y-2">
              {health.alerts.map((a) => (
                <li
                  key={a.id}
                  className={cn(
                    "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
                    a.level === "critical"
                      ? "bg-red-500/10 text-red-300"
                      : "bg-amber-500/10 text-amber-200"
                  )}
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  {a.message}
                </li>
              ))}
            </ul>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <Metric
              label="Last cron"
              value={
                health.cron.lastCronAt
                  ? formatDateTimeIST(health.cron.lastCronAt)
                  : "Never"
              }
              sub={
                health.cron.stale
                  ? "Stale"
                  : health.cron.minutesSinceCron != null
                    ? `${health.cron.minutesSinceCron}m ago`
                    : undefined
              }
              warn={health.cron.stale}
            />
            <Metric
              label="Last scan trades"
              value={`${health.scan.tradesExecuted} / ${health.scan.signalsFound} signals`}
              sub={`${health.scan.gateBlocked} gated · ${health.scan.dedupeBlocked} deduped`}
              warn={health.scan.zeroTradeWithSignals}
            />
            <Metric
              label="Open positions"
              value={String(health.portfolio.openPositions)}
              sub={`Balance ${formatCurrency(health.portfolio.balance)}`}
            />
            <Metric
              label="Portfolio drift"
              value={
                health.portfolio.driftIssueCount === 0
                  ? "None"
                  : `${health.portfolio.errorCount} err · ${health.portfolio.warningCount} warn`
              }
              warn={health.portfolio.errorCount > 0}
            />
          </div>

          {health.scan.priceCorrections > 0 && (
            <p className="text-xs text-amber-300/90 flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              {health.scan.priceCorrections} price correction(s) on last scan — signal hint diverged from Yahoo live quote
            </p>
          )}

          {health.portfolio.issues.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-2">
                Portfolio issues
              </p>
              <ul className="space-y-1 max-h-36 overflow-y-auto">
                {health.portfolio.issues.map((issue, i) => (
                  <li
                    key={`${issue.code}-${i}`}
                    className="rounded-lg bg-bg-tertiary/40 px-3 py-1.5 text-xs text-text-secondary"
                  >
                    <span
                      className={cn(
                        "font-medium",
                        issue.severity === "error"
                          ? "text-red-400"
                          : issue.severity === "warning"
                            ? "text-amber-400"
                            : "text-text-tertiary"
                      )}
                    >
                      {issue.severity}
                    </span>
                    {" — "}
                    {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {health.strategyPnl.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary mb-2">
                Paper P&amp;L by strategy (compare with backtest on Strategies page)
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-text-tertiary border-b border-border">
                      <SortableTh sortKey="strategy" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="text-left py-1.5 font-medium">Strategy</SortableTh>
                      <SortableTh sortKey="pnl" activeKey={sortKey} direction={sortDir} onSort={toggleSort} align="right" className="py-1.5 font-medium">Realized</SortableTh>
                      <SortableTh sortKey="rounds" activeKey={sortKey} direction={sortDir} onSort={toggleSort} align="right" className="py-1.5 font-medium">Rounds</SortableTh>
                      <SortableTh sortKey="wl" activeKey={sortKey} direction={sortDir} onSort={toggleSort} align="right" className="py-1.5 font-medium">W/L</SortableTh>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {sortedStrategyPnl.map((r) => (
                      <tr key={r.strategyName}>
                        <td className="py-1.5 text-text-secondary">{r.strategyName}</td>
                        <td
                          className={cn(
                            "py-1.5 text-right font-mono",
                            r.realizedPnl >= 0 ? "text-profit" : "text-loss"
                          )}
                        >
                          {formatCurrency(r.realizedPnl)}
                        </td>
                        <td className="py-1.5 text-right text-text-tertiary">
                          {r.closedRounds}
                        </td>
                        <td className="py-1.5 text-right text-text-tertiary">
                          {r.wins}/{r.losses}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-xs text-text-tertiary">
            Full scan diagnostics on{" "}
            <Link href="/strategies" className="text-accent hover:underline">
              Strategies
            </Link>
            {" "}for scan details and backtest comparison
          </p>
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg bg-bg-tertiary/40 px-2.5 py-2">
      <p className="text-text-tertiary">{label}</p>
      <p
        className={cn(
          "font-semibold text-text-primary truncate",
          warn && "text-amber-400"
        )}
        title={value}
      >
        {value}
      </p>
      {sub && (
        <p className={cn("text-text-tertiary mt-0.5", warn && "text-amber-400/80")}>
          {sub}
        </p>
      )}
    </div>
  );
}
