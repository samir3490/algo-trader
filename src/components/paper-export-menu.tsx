"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getOrders,
  getPaperTradingState,
  type AppSettings,
} from "@/lib/firebase";
import { normalizePaperTrades } from "@/lib/paper-trades/normalize";
import { resolvePaperStartingBalance } from "@/lib/paper-trading/balance";
import {
  downloadPaperExport,
  type PaperExportKind,
} from "@/lib/export/paper-data-export";

const EXPORT_OPTIONS: { kind: PaperExportKind; label: string }[] = [
  { kind: "all", label: "Export all (6 CSV files)" },
  { kind: "trades", label: "Trade history" },
  { kind: "holdings", label: "Holdings" },
  { kind: "positions", label: "Positions" },
  { kind: "orders", label: "Orders" },
  { kind: "summary", label: "Portfolio summary" },
  { kind: "strategy-pnl", label: "Strategy P&L" },
];

export default function PaperExportMenu({
  settings,
  className,
  variant = "default",
}: {
  settings?: AppSettings | null;
  className?: string;
  variant?: "default" | "compact";
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const runExport = useCallback(
    async (kind: PaperExportKind) => {
      setLoading(true);
      setError(null);
      setOpen(false);
      try {
        const [state, orders] = await Promise.all([
          getPaperTradingState(),
          getOrders(500),
        ]);
        const trades = normalizePaperTrades(state.trades ?? [], orders);
        downloadPaperExport(kind, {
          trades,
          holdings: state.holdings ?? [],
          positions: state.positions,
          orders,
          balance:
            state.balance ?? resolvePaperStartingBalance(settings ?? undefined),
          startingBalance: resolvePaperStartingBalance(settings ?? undefined),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Export failed");
      } finally {
        setLoading(false);
      }
    },
    [settings]
  );

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border border-border text-sm font-medium transition-colors disabled:opacity-60",
          variant === "compact"
            ? "px-3 py-1.5 bg-bg-tertiary text-text-secondary hover:bg-bg-hover"
            : "px-4 py-2 bg-bg-tertiary text-text-secondary hover:text-text-primary hover:border-border-light"
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        Export CSV
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 min-w-[220px] rounded-lg border border-border bg-bg-elevated py-1 shadow-xl">
          {EXPORT_OPTIONS.map((opt) => (
            <button
              key={opt.kind}
              type="button"
              onClick={() => void runExport(opt.kind)}
              className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="absolute right-0 top-full mt-1 text-xs text-red-400 whitespace-nowrap">
          {error}
        </p>
      )}
    </div>
  );
}
