import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { KiteConnect } from "kiteconnect";
import {
  APIKEY_PREFIX,
  TOKEN_PREFIX,
  getAccountApiKey,
  getAccountToken,
  getAllAccountIds,
} from "@/lib/zerodha/account-token";
import {
  getAdminAuth,
  getAdminFirestore,
  isFirebaseAdminConfigured,
} from "@/lib/firebase-admin";
import {
  listServerKiteTokens,
  loadServerKiteToken,
  type StoredKiteToken,
} from "@/lib/zerodha/server-token-store";

export type KiteSessionCreds = {
  kiteUserId: string;
  accessToken: string;
  apiKey: string;
  source: "cookie" | "server";
};

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24,
};

export function isKiteAuthError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || "");
  const lower = msg.toLowerCase();
  return (
    /token|session|authenticated|login|expired|invalid.*key|forbidden|403|401/.test(
      lower
    ) || /Incorrect.*api|api_key|access_token/i.test(msg)
  );
}

async function appUserIdFromRequest(
  request: NextRequest
): Promise<string | null> {
  if (!isFirebaseAdminConfigured()) return null;
  const authHeader = request.headers.get("authorization") || "";
  const idToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!idToken) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    return decoded.uid;
  } catch {
    return null;
  }
}

async function loadServerCreds(
  request: NextRequest,
  accountId?: string | null
): Promise<KiteSessionCreds | null> {
  const appUserId = await appUserIdFromRequest(request);
  if (!appUserId) return null;
  const db = getAdminFirestore();

  if (accountId) {
    const one = await loadServerKiteToken(db, appUserId, accountId);
    if (one?.accessToken && one.apiKey) {
      return {
        kiteUserId: one.kiteUserId || accountId,
        accessToken: one.accessToken,
        apiKey: one.apiKey,
        source: "server",
      };
    }
  }

  const all = await listServerKiteTokens(db, appUserId);
  const pick =
    (accountId && all.find((t) => t.kiteUserId === accountId)) || all[0];
  if (!pick?.accessToken || !pick.apiKey) return null;
  return {
    kiteUserId: pick.kiteUserId,
    accessToken: pick.accessToken,
    apiKey: pick.apiKey,
    source: "server",
  };
}

function cookieCreds(
  request: NextRequest,
  accountId?: string | null
): KiteSessionCreds | null {
  const ids = accountId
    ? [accountId]
    : [
        ...getAllAccountIds(request),
        request.cookies.get("kite_user_id")?.value,
      ].filter(Boolean) as string[];

  for (const id of ids) {
    const accessToken = getAccountToken(request, id);
    const apiKey = getAccountApiKey(request, id);
    if (accessToken && apiKey) {
      return { kiteUserId: id, accessToken, apiKey, source: "cookie" };
    }
  }

  const legacyToken = getAccountToken(request, null);
  const legacyKey = getAccountApiKey(request, null);
  const legacyUser = request.cookies.get("kite_user_id")?.value;
  if (legacyToken && legacyKey && legacyUser) {
    return {
      kiteUserId: legacyUser,
      accessToken: legacyToken,
      apiKey: legacyKey,
      source: "cookie",
    };
  }
  return null;
}

/** Write server session into browser cookies so this device catches up. */
export function applyKiteSessionCookies(
  response: NextResponse,
  session: KiteSessionCreds
): void {
  const id = session.kiteUserId;
  response.cookies.set(`${TOKEN_PREFIX}${id}`, session.accessToken, COOKIE_OPTS);
  response.cookies.set(`${APIKEY_PREFIX}${id}`, session.apiKey, COOKIE_OPTS);
  response.cookies.set("kite_access_token", session.accessToken, COOKIE_OPTS);
  response.cookies.set("kite_user_id", id, COOKIE_OPTS);
}

/**
 * Cookie first; if missing, use encrypted server token (requires Firebase Bearer).
 * Does not validate the token against Kite.
 */
export async function resolveKiteSession(
  request: NextRequest,
  accountId?: string | null
): Promise<KiteSessionCreds | null> {
  const fromCookie = cookieCreds(request, accountId);
  if (fromCookie) return fromCookie;
  return loadServerCreds(request, accountId);
}

/**
 * Prefer a working session: try cookie against Kite profile; on auth failure
 * (or missing cookie) fall back to server token and mark cookies for heal.
 */
export async function resolveWorkingKiteSession(
  request: NextRequest,
  accountId?: string | null
): Promise<{
  session: KiteSessionCreds | null;
  profileError?: string;
  healCookies: boolean;
}> {
  const cookie = cookieCreds(request, accountId);
  if (cookie) {
    try {
      const kite = new KiteConnect({ api_key: cookie.apiKey });
      kite.setAccessToken(cookie.accessToken);
      await kite.getProfile();
      return { session: cookie, healCookies: false };
    } catch (e) {
      // Stale desktop cookie after another device login — try server token.
      const server = await loadServerCreds(request, accountId || cookie.kiteUserId);
      if (server) {
        try {
          const kite = new KiteConnect({ api_key: server.apiKey });
          kite.setAccessToken(server.accessToken);
          await kite.getProfile();
          return { session: server, healCookies: true };
        } catch (e2) {
          return {
            session: null,
            profileError:
              e2 instanceof Error ? e2.message : "Server session invalid",
            healCookies: false,
          };
        }
      }
      return {
        session: null,
        profileError: e instanceof Error ? e.message : "Cookie session invalid",
        healCookies: false,
      };
    }
  }

  const server = await loadServerCreds(request, accountId);
  if (!server) return { session: null, healCookies: false };
  try {
    const kite = new KiteConnect({ api_key: server.apiKey });
    kite.setAccessToken(server.accessToken);
    await kite.getProfile();
    return { session: server, healCookies: true };
  } catch (e) {
    return {
      session: null,
      profileError: e instanceof Error ? e.message : "Server session invalid",
      healCookies: false,
    };
  }
}

/**
 * Run a Kite call with cookie creds; on auth failure retry with server token
 * and heal browser cookies when the retry succeeds.
 */
export async function withKiteCredsRetry<T>(
  request: NextRequest,
  accountId: string | null | undefined,
  run: (creds: KiteSessionCreds) => Promise<T>
): Promise<{ ok: true; data: T; responseInit?: { heal?: KiteSessionCreds } } | { ok: false; status: number; error: string }> {
  const cookie = cookieCreds(request, accountId);
  if (cookie) {
    try {
      const data = await run(cookie);
      return { ok: true, data };
    } catch (e) {
      if (!isKiteAuthError(e)) {
        return {
          ok: false,
          status: 500,
          error: e instanceof Error ? e.message : "Kite request failed",
        };
      }
    }
  }

  const server = await loadServerCreds(request, accountId);
  if (!server) {
    return {
      ok: false,
      status: 401,
      error: cookie
        ? "Zerodha session expired on this device — reconnect, or open Live Trading after logging in elsewhere so the server token can sync."
        : "Not authenticated",
    };
  }

  try {
    const data = await run(server);
    return { ok: true, data, responseInit: { heal: server } };
  } catch (e) {
    return {
      ok: false,
      status: 500,
      error: e instanceof Error ? e.message : "Kite request failed",
    };
  }
}

export function jsonWithOptionalHeal(
  body: unknown,
  heal?: KiteSessionCreds,
  init?: { status?: number }
): NextResponse {
  const res = NextResponse.json(body, { status: init?.status ?? 200 });
  if (heal) applyKiteSessionCookies(res, heal);
  return res;
}

export type { StoredKiteToken };
