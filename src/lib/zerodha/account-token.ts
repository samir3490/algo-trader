import { NextRequest } from "next/server";

const COOKIE_PREFIX = "kite_token_";

export function getAccountToken(
  request: NextRequest,
  accountId?: string | null
): string | null {
  if (accountId) {
    const perAccountToken = request.cookies.get(`${COOKIE_PREFIX}${accountId}`)?.value;
    if (perAccountToken) return perAccountToken;

    // Fallback: if the requested accountId matches the legacy cookie's user,
    // return the legacy token (pre-multi-account connections)
    const legacyUserId = request.cookies.get("kite_user_id")?.value;
    if (legacyUserId === accountId) {
      return request.cookies.get("kite_access_token")?.value || null;
    }
    return null;
  }
  return request.cookies.get("kite_access_token")?.value || null;
}

export function getAllAccountIds(request: NextRequest): string[] {
  const ids: string[] = [];
  request.cookies.getAll().forEach((cookie) => {
    if (cookie.name.startsWith(COOKIE_PREFIX)) {
      ids.push(cookie.name.slice(COOKIE_PREFIX.length));
    }
  });
  return ids;
}

export { COOKIE_PREFIX };
