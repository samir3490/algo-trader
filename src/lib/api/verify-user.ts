import { NextRequest } from "next/server";
import { getAdminAuth, isFirebaseAdminConfigured } from "@/lib/firebase-admin";

export type VerifiedUser =
  | { ok: true; uid: string }
  | { ok: false; status: number; error: string };

/** Verify Firebase ID token from Authorization: Bearer header. */
export async function verifyRequestUser(
  request: NextRequest
): Promise<VerifiedUser> {
  if (!isFirebaseAdminConfigured()) {
    return {
      ok: false,
      status: 503,
      error:
        "Server is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON on Vercel.",
    };
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Missing authorization" };
  }

  const token = authHeader.slice(7);
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return { ok: true, uid: decoded.uid };
  } catch {
    return { ok: false, status: 401, error: "Invalid or expired token" };
  }
}
