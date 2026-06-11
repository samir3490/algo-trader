import type { UserAuditEntry } from "./user-audit-log";

/** Firestore rejects undefined anywhere in a document. */
export function sanitizeForFirestore(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeForFirestore(item))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = sanitizeForFirestore(val);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    return out;
  }
  return value;
}

export function sanitizeAuditEntry(entry: UserAuditEntry): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: entry.id,
    timestamp: entry.timestamp,
    severity: entry.severity,
    source: entry.source,
    message: entry.message,
  };
  if (entry.meta != null) {
    const meta = sanitizeForFirestore(entry.meta);
    if (
      meta != null &&
      typeof meta === "object" &&
      Object.keys(meta as object).length > 0
    ) {
      row.meta = meta;
    }
  }
  return row;
}

export function sanitizeAuditEntries(
  entries: UserAuditEntry[]
): Record<string, unknown>[] {
  return entries.map(sanitizeAuditEntry);
}
