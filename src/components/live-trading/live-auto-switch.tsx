"use client";

import { Power, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Explicit action-labeled control — shows current state and what the button will do.
 */
export default function LiveAutoSwitch({
  enabled,
  saving,
  onToggle,
  className,
  compact,
}: {
  enabled: boolean;
  saving?: boolean;
  onToggle: (next: boolean) => void;
  className?: string;
  /** Smaller header chip style */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className={cn("flex flex-col items-stretch gap-1 sm:items-end", className)}>
        <p
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wide text-right",
            enabled ? "text-red-800" : "text-emerald-800"
          )}
        >
          Auto trading is {enabled ? "ON" : "OFF"}
        </p>
        <button
          type="button"
          disabled={saving}
          onClick={() => onToggle(!enabled)}
          className={cn(
            "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60",
            enabled
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-emerald-600 text-white hover:bg-emerald-700"
          )}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Power className="h-3.5 w-3.5" />
          )}
          {enabled ? "Turn OFF auto trading" : "Turn ON auto trading"}
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border-2 p-4 sm:p-5 space-y-3",
        enabled
          ? "border-red-300 bg-red-50"
          : "border-emerald-300 bg-emerald-50",
        className
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              "rounded-lg p-2 shrink-0",
              enabled ? "bg-red-100" : "bg-emerald-100"
            )}
          >
            <Power
              className={cn(
                "h-5 w-5",
                enabled ? "text-red-800" : "text-emerald-800"
              )}
            />
          </div>
          <div className="min-w-0">
            <p
              className={cn(
                "text-sm font-bold",
                enabled ? "text-red-950" : "text-emerald-950"
              )}
            >
              Automatic live trading is{" "}
              <span className="underline">{enabled ? "ON" : "OFF"}</span>
            </p>
            <p
              className={cn(
                "text-xs mt-1 leading-relaxed",
                enabled ? "text-red-900" : "text-emerald-900"
              )}
            >
              {enabled
                ? "Cron is allowed to place real BUY and SELL orders on Zerodha (within capital limits). Paper trading still runs separately."
                : "No algo live orders. Paper trading continues. Click the green button to start real-money auto trading."}
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => onToggle(!enabled)}
          className={cn(
            "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white transition-colors disabled:opacity-60 self-start sm:self-center",
            enabled
              ? "bg-red-600 hover:bg-red-700"
              : "bg-emerald-600 hover:bg-emerald-700"
          )}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Power className="h-4 w-4" />
          )}
          {enabled ? "Turn OFF auto trading" : "Turn ON auto trading"}
        </button>
      </div>
    </div>
  );
}
