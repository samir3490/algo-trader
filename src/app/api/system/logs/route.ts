import { NextRequest, NextResponse } from "next/server";
import { getRecentSystemLogs } from "@/lib/core/system-log";
import { getAdminAuth, getAdminFirestore, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import type { UserAuditEntry } from "@/lib/audit/user-audit-log";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ") && isFirebaseAdminConfigured()) {
    const token = authHeader.slice(7);
    try {
      const decoded = await getAdminAuth().verifyIdToken(token);
      const db = getAdminFirestore();
      const snap = await db.doc(`users/${decoded.uid}/data/auditLog`).get();
      const entries = (snap.data()?.entries ?? []) as UserAuditEntry[];
      return NextResponse.json({
        logs: entries.slice(0, 150),
        source: "firestore",
      });
    } catch {
      return NextResponse.json(
        { logs: [], source: "firestore", error: "Could not load audit logs" },
        { status: 401 }
      );
    }
  }

  return NextResponse.json({
    logs: getRecentSystemLogs(150),
    source: "memory",
    hint: "Sign in to load your saved audit history from Firestore.",
  });
}
