import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db, getUserId } from "@/lib/firebase";
import { sanitizeAuditEntries } from "./sanitize-audit";

export type UserAuditSeverity = "INFO" | "WARN" | "ERROR" | "RISK_REJECTION";

export interface UserAuditEntry {
  id: string;
  timestamp: string;
  severity: UserAuditSeverity;
  source: string;
  message: string;
  meta?: Record<string, unknown>;
}

const MAX_ENTRIES = 200;

export async function appendUserAuditLog(
  entry: Omit<UserAuditEntry, "id" | "timestamp"> & { timestamp?: string }
): Promise<void> {
  const ref = doc(db, "users", getUserId(), "data", "auditLog");
  const snap = await getDoc(ref);
  const existing = (snap.data()?.entries ?? []) as UserAuditEntry[];
  const row: UserAuditEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: entry.timestamp ?? new Date().toISOString(),
    severity: entry.severity,
    source: entry.source,
    message: entry.message,
    ...(entry.meta != null ? { meta: entry.meta } : {}),
  };
  await setDoc(
    ref,
    {
      entries: sanitizeAuditEntries([row, ...existing]).slice(0, MAX_ENTRIES),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getUserAuditLogs(limit = 150): Promise<UserAuditEntry[]> {
  try {
    const ref = doc(db, "users", getUserId(), "data", "auditLog");
    const snap = await getDoc(ref);
    if (!snap.exists()) return [];
    return ((snap.data()?.entries ?? []) as UserAuditEntry[]).slice(0, limit);
  } catch (e) {
    console.error("Error loading audit logs:", e);
    return [];
  }
}

export { formatScanAuditMessage } from "@/lib/strategies/scan-diagnostics";
