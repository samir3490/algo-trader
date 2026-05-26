import { NextRequest } from "next/server";

const COOKIE_PREFIX = "kite_token_";

export function getAccountToken(
  request: NextRequest,
  accountId?: string | null
): string | null {
  if (accountId) {
    return request.cookies.get(`${COOKIE_PREFIX}${accountId}`)?.value || null;
  }
  // Fallback: try legacy single-account cookie
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
