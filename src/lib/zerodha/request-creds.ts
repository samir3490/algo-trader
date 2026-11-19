import type { NextRequest } from "next/server";
import {
  getAccountApiKey,
  getAccountToken,
  getAllAccountIds,
} from "@/lib/zerodha/account-token";
import type { KiteCreds } from "@/lib/market-data/resolve-live-quote";

/** Resolve the first available Zerodha session from request cookies. */
export function getRequestKiteCreds(
  request: NextRequest,
  accountId?: string | null
): KiteCreds | null {
  const ids = accountId
    ? [accountId]
    : [
        ...getAllAccountIds(request),
        request.cookies.get("kite_user_id")?.value,
      ].filter(Boolean) as string[];

  for (const id of ids) {
    const accessToken = getAccountToken(request, id);
    const apiKey = getAccountApiKey(request, id);
    if (accessToken && apiKey) return { accessToken, apiKey };
  }

  const legacyToken = getAccountToken(request, null);
  const legacyKey = getAccountApiKey(request, null);
  if (legacyToken && legacyKey) {
    return { accessToken: legacyToken, apiKey: legacyKey };
  }
  return null;
}
