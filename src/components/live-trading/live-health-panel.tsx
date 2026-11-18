"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import LiveAutoSwitch from "@/components/live-trading/live-auto-switch";
import { useAuth } from "@/lib/auth-context";
import { getSettings, type AppSettings } from "@/lib/firebase";
import {
  resolveLiveCapitalLimit,
  resolveLiveOrderNotional,
} from "@/lib/live-trading/capital-limits";
import { loadSettingsFromCache } from "@/lib/settings/cache";

type RowStatus = "ok" | "warn" | "bad" | "info";

function StatusRow({
  label,
  detail,
  status,
}: {
  label: string;
  detail: string;
  status: RowStatus;
}) {
  const Icon =
    status === "ok"
      ? CheckCircle2
      : status === "bad"
        ? ShieldAlert
        : AlertTriangle;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-bg-secondary/50 px-3 py-3">
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 mt-0.5",
          status === "ok" && "text-emerald-700",
          status === "warn" && "text-amber-700",
          status === "bad" && "text-red-700",
          status === "info" && "text-text-secondary"
        )}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">
          {detail}
        </p>
      </div>
    </div>
  );
}

/** Live trading health — kill switch, capital, connection. */
export default function LiveHealthPanel({
  connected,
  accountId,
  available,
  autoOn,
  onToggleAuto,
  savingAuto,
}: {
  connected: boolean;
  accountId?: string;
  available: number;
  autoOn: boolean;
  onToggleAuto: (next: boolean) => void;
  savingAuto?: boolean;
}) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AppSettings>(() =>
    loadSettingsFromCache()
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void getSettings()
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const orderNotional = resolveLiveOrderNotional(settings);
  const capitalLimit = resolveLiveCapitalLimit(settings);

  if (loading) {
    return (
      <div className="card flex items-center gap-2 py-8 text-sm text-text-tertiary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading live health…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <LiveAutoSwitch
        enabled={autoOn}
        saving={savingAuto}
        onToggle={onToggleAuto}
      />

      <div className="grid gap-2 sm:grid-cols-2">
        <StatusRow
          label="Zerodha session"
          detail={
            connected
              ? `Connected${accountId ? ` · ${accountId}` : ""} · available ${formatCurrency(available)}`
              : "Not connected — reconnect in Settings → Live"
          }
          status={connected ? "ok" : "bad"}
        />
        <StatusRow
          label="Capital limits"
          detail={`₹${orderNotional.toLocaleString("en-IN")} / trade · ₹${capitalLimit.toLocaleString("en-IN")} total cap`}
          status="info"
        />
        <StatusRow
          label="Live Rules"
          detail={
            autoOn
              ? "Auto is on — review Live Rules before market open"
              : "Auto is off — paper can run independently"
          }
          status={autoOn ? "warn" : "ok"}
        />
        <StatusRow
          label="Cash vs cap"
          detail={
            available > 0
              ? `Broker cash ${formatCurrency(available)} (algo still capped at ₹${capitalLimit.toLocaleString("en-IN")})`
              : "No margin data — reconnect for live balances"
          }
          status={available > 0 ? "ok" : "warn"}
        />
      </div>

      <div className="rounded-lg border border-border bg-bg-secondary px-4 py-3 text-xs text-text-secondary flex flex-wrap gap-x-4 gap-y-1">
        <Link href="/settings?tab=live" className="text-emerald-800 font-medium hover:underline">
          Live Settings →
        </Link>
        <Link
          href="/settings?tab=live-rules"
          className="text-emerald-800 font-medium hover:underline"
        >
          Live Rules →
        </Link>
        <span className="inline-flex items-center gap-1 text-text-tertiary">
          <Wallet className="h-3 w-3" />
          Paper health stays on Paper Trading → Health
        </span>
      </div>
    </div>
  );
}
