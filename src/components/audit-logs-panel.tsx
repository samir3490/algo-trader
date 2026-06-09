"use client";

import { useEffect, useState } from "react";
import { ScrollText, RefreshCw } from "lucide-react";
import { cn, formatDateTimeIST } from "@/lib/utils";

interface LogRow {
  id: string;
  timestamp: string;
  severity: string;
  source: string;
  message: string;
}

export default function AuditLogsPanel({ tall = false }: { tall?: boolean }) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/system/logs");
      const data = await res.json();
      setLogs(data.logs ?? []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-accent-muted p-2">
            <ScrollText className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              System audit logs
            </h2>
            <p className="text-xs text-text-secondary">
              Market data, backtests, and risk rejections (server memory)
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="p-2 rounded-lg border border-border hover:bg-bg-hover"
          title="Refresh"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      <div
        className={cn(
          "overflow-x-auto overflow-y-auto",
          tall ? "max-h-[min(70vh,560px)]" : "max-h-64"
        )}
      >
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-text-tertiary text-left">
              <th className="py-2 pr-3">Date &amp; time</th>
              <th className="py-2 pr-3">Level</th>
              <th className="py-2 pr-3">Source</th>
              <th className="py-2">Message</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-border/40">
                <td className="py-2 pr-3 text-text-tertiary whitespace-nowrap">
                  {formatDateTimeIST(l.timestamp)}
                </td>
                <td className="py-2 pr-3">
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded font-medium",
                      l.severity === "ERROR" && "bg-loss/20 text-loss",
                      l.severity === "RISK_REJECTION" &&
                        "bg-amber-500/20 text-amber-400",
                      l.severity === "WARN" && "bg-amber-500/10 text-amber-300",
                      l.severity === "INFO" && "bg-border/40 text-text-tertiary"
                    )}
                  >
                    {l.severity}
                  </span>
                </td>
                <td className="py-2 pr-3 text-text-secondary">{l.source}</td>
                <td className="py-2 text-text-primary">{l.message}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-text-tertiary">
                  No logs yet. Run a backtest or wait for the strategy cron.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
