export type LogSeverity = "INFO" | "WARN" | "ERROR" | "RISK_REJECTION";

export interface SystemLogEntry {
  id: string;
  timestamp: string;
  severity: LogSeverity;
  source: string;
  message: string;
  meta?: Record<string, unknown>;
}

const MAX_LOGS = 500;
const buffer: SystemLogEntry[] = [];

export function writeSystemLog(
  severity: LogSeverity,
  source: string,
  message: string,
  meta?: Record<string, unknown>
): void {
  const entry: SystemLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    severity,
    source,
    message,
    meta,
  };
  buffer.unshift(entry);
  if (buffer.length > MAX_LOGS) buffer.length = MAX_LOGS;
  if (severity === "ERROR") {
    console.error(`[${source}]`, message, meta ?? "");
  }
}

export function getRecentSystemLogs(limit = 100): SystemLogEntry[] {
  return buffer.slice(0, limit);
}
