"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Compact Live trading ON/OFF toggle — clear state, small footprint.
 */
export default function LiveAutoSwitch({
  enabled,
  saving,
  onToggle,
  className,
  /** Kept for callers; both modes use the same compact control. */
  compact: _compact,
}: {
  enabled: boolean;
  saving?: boolean;
  onToggle: (next: boolean) => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5",
        enabled
          ? "border-emerald-300 bg-emerald-50"
          : "border-border bg-bg-secondary",
        className
      )}
    >
      <span className="text-xs font-medium text-text-secondary whitespace-nowrap">
        Live trading
      </span>
      <span
        className={cn(
          "text-[10px] font-bold uppercase tracking-wide min-w-[1.75rem] text-center",
          enabled ? "text-emerald-800" : "text-text-tertiary"
        )}
      >
        {enabled ? "ON" : "OFF"}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={enabled ? "Live trading on" : "Live trading off"}
        disabled={saving}
        onClick={() => onToggle(!enabled)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-60",
          enabled ? "bg-emerald-600" : "bg-border"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-sm transition-transform",
            enabled && "translate-x-4"
          )}
        >
          {saving ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin text-text-tertiary" />
          ) : null}
        </span>
      </button>
    </div>
  );
}
