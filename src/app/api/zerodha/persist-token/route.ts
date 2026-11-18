import { NextRequest, NextResponse } from "next/server";
import {
  getAdminAuth,
  getAdminFirestore,
  isFirebaseAdminConfigured,
} from "@/lib/firebase-admin";
import { getAccountApiKey, getAccountToken } from "@/lib/zerodha/account-token";
import { saveServerKiteToken } from "@/lib/zerodha/server-token-store";

/** Copy browser Kite session into encrypted Firestore for cron live auto-trading. */
export async function POST(request: NextRequest) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Firebase admin not configured" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization") || "";
  const idToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";
  if (!idToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let appUserId: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    appUserId = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const accountId = String(body.accountId || "").trim();
  if (!accountId) {
    return NextResponse.json({ error: "accountId required" }, { status: 400 });
  }

  const accessToken = getAccountToken(request, accountId);
  const apiKey = getAccountApiKey(request, accountId);
  if (!accessToken || !apiKey) {
    return NextResponse.json(
      { error: "No active Kite session cookie for this account" },
      { status: 400 }
    );
  }

  await saveServerKiteToken(getAdminFirestore(), appUserId, {
    kiteUserId: accountId,
    apiKey,
    accessToken,
  });

  return NextResponse.json({ ok: true, kiteUserId: accountId });
}
