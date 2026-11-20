import { NextRequest, NextResponse } from "next/server";
import { KiteConnect } from "kiteconnect";
import { getAllAccountIds, getAccountApiKey } from "@/lib/zerodha/account-token";
import {
  applyKiteSessionCookies,
  resolveWorkingKiteSession,
} from "@/lib/zerodha/resolve-session";
import {
  getAdminAuth,
  getAdminFirestore,
  isFirebaseAdminConfigured,
} from "@/lib/firebase-admin";
import { listServerKiteTokens } from "@/lib/zerodha/server-token-store";

export async function GET(request: NextRequest) {
  const accountIds = getAllAccountIds(request);
  const legacyUserId = request.cookies.get("kite_user_id")?.value;
  const ids =
    accountIds.length > 0
      ? accountIds
      : legacyUserId
        ? [legacyUserId]
        : [];

  // Also surface server-stored accounts (e.g. logged in on phone, desktop cookies stale).
  let serverIds: string[] = [];
  if (isFirebaseAdminConfigured()) {
    const authHeader = request.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";
    if (idToken) {
      try {
        const decoded = await getAdminAuth().verifyIdToken(idToken);
        const tokens = await listServerKiteTokens(
          getAdminFirestore(),
          decoded.uid
        );
        serverIds = tokens.map((t) => t.kiteUserId).filter(Boolean);
      } catch {
        /* ignore */
      }
    }
  }

  const allIds = [...new Set([...ids, ...serverIds])];
  if (allIds.length === 0) {
    return NextResponse.json({ accounts: [] });
  }

  let healSession: Awaited<
    ReturnType<typeof resolveWorkingKiteSession>
  >["session"] = null;

  const accounts = await Promise.all(
    allIds.map(async (id) => {
      const working = await resolveWorkingKiteSession(request, id);
      if (working.session && working.healCookies && !healSession) {
        healSession = working.session;
      }
      if (!working.session) {
        return {
          kiteUserId: id,
          connected: false,
          profileError: true,
          error: working.profileError || "Session expired — reconnect Zerodha",
        };
      }

      try {
        const kite = new KiteConnect({ api_key: working.session.apiKey });
        kite.setAccessToken(working.session.accessToken);
        const profile = await kite.getProfile();
        return {
          kiteUserId: profile.user_id || id,
          userName: profile.user_name || "",
          email: profile.email || "",
          broker: profile.broker || "",
          connected: true,
          sessionSource: working.session.source,
        };
      } catch (e) {
        return {
          kiteUserId: id,
          connected: false,
          profileError: true,
          error: e instanceof Error ? e.message : "Profile failed",
        };
      }
    })
  );

  // Legacy path when only legacy cookies existed without per-account id list
  if (accounts.length === 0 && legacyUserId) {
    const apiKey = getAccountApiKey(request, legacyUserId);
    const legacyToken = request.cookies.get("kite_access_token")?.value;
    if (legacyToken && apiKey) {
      try {
        const kite = new KiteConnect({ api_key: apiKey });
        kite.setAccessToken(legacyToken);
        const profile = await kite.getProfile();
        const res = NextResponse.json({
          accounts: [
            {
              kiteUserId: profile.user_id || legacyUserId,
              userName: profile.user_name || "",
              email: profile.email || "",
              broker: profile.broker || "",
              connected: true,
            },
          ],
        });
        return res;
      } catch {
        return NextResponse.json({
          accounts: [
            {
              kiteUserId: legacyUserId,
              connected: false,
              profileError: true,
              error: "Session expired — reconnect Zerodha",
            },
          ],
        });
      }
    }
  }

  const res = NextResponse.json({ accounts });
  if (healSession) applyKiteSessionCookies(res, healSession);
  return res;
}
