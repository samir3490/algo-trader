"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn, formatDateTimeIST } from "@/lib/utils";
import type { PaperTradingHealth } from "@/lib/health/paper-trading-health";

const LEVEL_STYLES = {
  ok: {
    icon: CheckCircle2,
    iconClass: "text-emerald-400",
    badge: "bg-emerald-500/15 text-emerald-400",
    label: "Healthy",
    border: "border-emerald-500/30",
  },
  warning: {
    icon: AlertTriangle,
    iconClass: "text-amber-400",
    badge: "bg-amber-500/15 text-amber-400",
    label: "Warnings",
    border: "border-amber-500/40",
  },
  critical: {
    icon: XCircle,
    iconClass: "text-red-400",
    badge: "bg-red-500/15 text-red-400",
    label: "Needs attention",
    border: "border-red-500/40",
  },
} as const;

export default function PaperHealthStrip() {
  const { user } = useAuth();
  const [health, setHealth] = useState<PaperTradingHealth | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/paper/health", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setHealth(data.health);
    } catch {
      /* strip stays minimal on failure */
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchHealth();
  }, [fetchHealth]);

  if (!user) return null;

  const level = health?.level ?? "ok";
  const styles = LEVEL_STYLES[level];
  const StatusIcon = styles.icon;

  const cronLabel = health?.cron.lastCronAt
    ? health.cron.stale
      ? "Cron stale"
      : health.cron.minutesSinceCron != null
        ? `Cron ${health.cron.minutesSinceCron}m ago`
        : "Cron OK"
    : "No cron yet";

  const driftLabel =
    health && health.portfolio.driftIssueCount > 0
      ? `${health.portfolio.driftIssueCount} drift issue(s)`
      : "No drift";

  return (
    <section
      className={cn(
        "rounded-xl border bg-bg-secondary px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3",
        health ? styles.border : "border-border"
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-text-tertiary shrink-0" />
        ) : (
          <StatusIcon className={cn("h-4 w-4 shrink-0", styles.iconClass)} />
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-text-primary">Paper trading</span>
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
          <p className="text-xs text-text-tertiary truncate">
            {cronLabel} · {driftLabel}
            {health?.checkedAt && (
              <> · {formatDateTimeIST(health.checkedAt)}</>
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => void fetchHealth()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-tertiary px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-hover transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </button>
        <Link
          href="/paper-trading"
          className="inline-flex items-center rounded-lg bg-accent/90 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-accent transition-colors"
        >
          Full health &amp; trades
        </Link>
      </div>
    </section>
  );
}
