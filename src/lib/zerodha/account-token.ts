import { NextRequest } from "next/server";

const TOKEN_PREFIX = "kite_token_";
const APIKEY_PREFIX = "kite_apikey_";

export function getAccountToken(
  request: NextRequest,
  accountId?: string | null
): string | null {
  if (accountId) {
    const perAccountToken = request.cookies.get(`${TOKEN_PREFIX}${accountId}`)?.value;
    if (perAccountToken) return perAccountToken;

    const legacyUserId = request.cookies.get("kite_user_id")?.value;
    if (legacyUserId === accountId) {
      return request.cookies.get("kite_access_token")?.value || null;
    }
    return null;
  }
  return request.cookies.get("kite_access_token")?.value || null;
}

export function getAccountApiKey(
  request: NextRequest,
  accountId?: string | null
): string | null {
  if (accountId) {
    const perAccountKey = request.cookies.get(`${APIKEY_PREFIX}${accountId}`)?.value;
    if (perAccountKey) return perAccountKey;
  }
  // Fallback to default env var
  return process.env.KITE_API_KEY || null;
}

export function getAllAccountIds(request: NextRequest): string[] {
  const ids: string[] = [];
  request.cookies.getAll().forEach((cookie) => {
    if (cookie.name.startsWith(TOKEN_PREFIX)) {
      ids.push(cookie.name.slice(TOKEN_PREFIX.length));
    }
  });
  return ids;
}

export { TOKEN_PREFIX, APIKEY_PREFIX };
