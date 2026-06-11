import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { UserAuditEntry, UserAuditSeverity } from "./user-audit-log";

const MAX_ENTRIES = 200;

export async function appendUserAuditLogAdmin(
  db: Firestore,
  userId: string,
  entry: {
    severity: UserAuditSeverity;
    source: string;
    message: string;
    meta?: Record<string, unknown>;
    timestamp?: string;
  }
): Promise<void> {
  const ref = db.doc(`users/${userId}/data/auditLog`);
  const snap = await ref.get();
  const existing = (snap.data()?.entries ?? []) as UserAuditEntry[];
  const row: UserAuditEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: entry.timestamp ?? new Date().toISOString(),
    severity: entry.severity,
    source: entry.source,
    message: entry.message,
    meta: entry.meta,
  };
  await ref.set(
    {
      entries: [row, ...existing].slice(0, MAX_ENTRIES),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
